"""[US-A3, US-C1] OSM 태그 및 DEM 실측 기반 노면/경사도 평가 파이프라인 테스트.

1. DEM 표고 추정 및 두 지점 간 경사도(%) 계산 정합성 검증.
2. 경사도 8% 이상 급경사/계단 구간의 'caution'(주황) 분류 검증.
3. 완만 구간(4% 미만) 및 친자연/그늘 노면의 'safe'(초록) 분류 검증.
4. GeoJSON 세그먼트 FeatureCollection의 연속성(모든 세그먼트 끝점==다음 시작점) 보장 검증.
"""

import pytest
from typing import List

from agent.surface_slope_evaluator import (
    MAX_WALKABLE_SLOPE_PERCENT,
    apply_barrier_free_constraints,
    exclude_steep_links,
    filter_links_avoiding_stairs,
    estimate_elevation_m,
    calculate_segment_slope_percent,
    classify_segment_risk,
    evaluate_route_metrics,
    build_segmented_geojson,
)
from agent.walk_planning_agent import run_walk_planning_agent


class TestSurfaceSlopeEvaluator:
    """노면 및 경사도 평가 모듈 단위 테스트."""

    def test_dem_elevation_estimation_known_locations(self):
        """서울 주요 랜드마크의 DEM 해발 고도가 현실적인 범위에 수렴하는지 검증."""
        # 1. 서울숲 (한강변 평지: 6m ~ 15m)
        elev_forest = estimate_elevation_m(127.040, 37.540)
        assert 6.0 <= elev_forest <= 16.0

        # 2. 서울시청 (도심 평탄지형: 25m ~ 35m)
        elev_cityhall = estimate_elevation_m(126.978, 37.566)
        assert 24.0 <= elev_cityhall <= 35.0

        # 3. 덕수궁 돌담길/정동 언덕 (고도 상승: 28m ~ 50m)
        elev_jeongdong = estimate_elevation_m(126.972, 37.569)
        assert 30.0 <= elev_jeongdong <= 50.0

        # 4. 강남 테헤란로 역삼 고개 (서초 18m -> 역삼 35m 이상 상승)
        elev_gangnam_west = estimate_elevation_m(127.025, 37.498)
        elev_yeoksam_east = estimate_elevation_m(127.035, 37.500)
        assert elev_yeoksam_east > elev_gangnam_west

    def test_slope_calculation_and_classification(self):
        """수평 거리와 고도차에 따른 경사도(%) 및 안심 등급 분류 검증."""
        # 평탄로 (거리 100m, 고도차 1m -> 경사도 1.0%)
        p_flat_1 = [126.9780, 37.5660]
        p_flat_2 = [126.9780, 37.5669]
        slope_flat = calculate_segment_slope_percent(p_flat_1, p_flat_2)
        assert slope_flat < 4.0
        risk_flat = classify_segment_risk(slope_flat, has_stairs=False, surface="dirt", shaded=True)
        assert risk_flat == "safe"

        # 급경사 (8.5% 경사)
        risk_steep = classify_segment_risk(8.5, has_stairs=False, surface="paved", shaded=False)
        assert risk_steep == "caution"

        # 계단 포함 구간은 완만하더라도 caution 부여
        risk_stairs = classify_segment_risk(2.0, has_stairs=True, surface="paved", shaded=True)
        assert risk_stairs == "caution"

        # 보통 경사 (5.5% 경사)
        risk_normal = classify_segment_risk(5.5, has_stairs=False, surface="paved", shaded=False)
        assert risk_normal == "normal"

    def test_route_metrics_aggregation(self):
        """경로 좌표열 전체에 대한 노면/경사/고도 지표 종합 실측 검증."""
        # 덕수궁 돌담길 순환 코스 샘플
        route_coords = [
            [126.9784, 37.5663],
            [126.9752, 37.5663],
            [126.9744, 37.5668],
            [126.9732, 37.5674],
            [126.9715, 37.5680],
            [126.9714, 37.5690],
            [126.9744, 37.5700],
            [126.9784, 37.5663],
        ]
        metrics = evaluate_route_metrics(route_coords)

        assert "max_slope_percent" in metrics
        assert "avg_slope_percent" in metrics
        assert "elevation_min_m" in metrics
        assert "elevation_max_m" in metrics
        assert metrics["elevation_max_m"] >= metrics["elevation_min_m"]
        assert "surface_distribution" in metrics
        assert sum(metrics["surface_distribution"].values()) == pytest.approx(1.0, 0.01)

    def test_segmented_geojson_spatial_continuity_and_properties(self):
        """실데이터 기반 분할 GeoJSON의 3대 안심 등급 속성 및 선분 연속성(Line continuity) 검증."""
        coords = [
            [126.9784, 37.5663],
            [126.9784, 37.5666],
            [126.9770, 37.5671],
            [126.9752, 37.5663],
            [126.9744, 37.5668],
            [126.9732, 37.5674],
            [126.9715, 37.5680],
            [126.9744, 37.5700],
            [126.9784, 37.5663],
        ]

        geojson = build_segmented_geojson(coords, max_slope_hint=4.5)
        assert geojson["type"] == "FeatureCollection"
        features = geojson["features"]
        assert len(features) >= 1

        # 1. 모든 피처의 프로퍼티 정합성 검증
        for feat in features:
            assert feat["type"] == "Feature"
            props = feat["properties"]
            assert props["segmentType"] in {"safe", "normal", "caution"}
            assert isinstance(props["maxSlopePercent"], (int, float))
            # 그늘·노면은 실측값이 없으면 None (예전에는 경사로 지어낸 값이었다, #158)
            assert props["shaded"] is None or isinstance(props["shaded"], bool)
            assert "surface" in props
            assert "slopeSignedPercent" in props and "surfaceTempC" in props

            # LineString 좌표 유효성
            geom = feat["geometry"]
            assert geom["type"] == "LineString"
            assert len(geom["coordinates"]) >= 2

        # 2. 연속성 검증: i번째 세그먼트의 마지막 좌표 == i+1번째 세그먼트의 첫 번째 좌표
        for i in range(len(features) - 1):
            last_pt = features[i]["geometry"]["coordinates"][-1]
            next_first_pt = features[i + 1]["geometry"]["coordinates"][0]
            assert last_pt == next_first_pt, f"세그먼트 {i}와 {i+1} 간의 연결 끊김 발견"

    def test_e2e_agent_segmented_geojson_output(self):
        """에이전트 실행 결과 및 API 연동 시 실측 세그먼트 GeoJSON이 정상 생성되는지 검증."""
        result = run_walk_planning_agent(
            user_query="서울숲에서 20분 동안 관절에 무리 없는 부드러운 산책로 추천해줘",
            client_dog_context={
                "dog_id": "dog_forest",
                "name": "루루",
                "breed": "포메라니안",
                "age_years": 3,
                "weight_kg": 3.2,
                "joint_care_level": 2,
            },
            origin_lat=37.5445,
            origin_lon=127.0375,
        )
        best = result.best_route
        coords = best.geojson_coordinates

        geojson = build_segmented_geojson(coords, max_slope_hint=best.max_slope_percent)
        assert geojson["type"] == "FeatureCollection"
        assert len(geojson["features"]) >= 1

        # 서울숲 평지 산책로의 경우 safe 등급 세그먼트가 최소 1개 이상 존재해야 함
        types = [f["properties"]["segmentType"] for f in geojson["features"]]
        assert "safe" in types


class TestBarrierFreeConstraints:
    """[US-B1] 무장애길 하드 제약: 계단 배제 및 15도(약 26.8%) 이상 급경사 배제."""

    def test_slope_limit_equals_15_degrees(self):
        """한계 경사도가 tan(15°) x 100 = 약 26.8% 인지 검증."""
        assert MAX_WALKABLE_SLOPE_PERCENT == pytest.approx(26.8, abs=0.05)

    def test_stairs_links_are_removed_and_reported(self, mock_osm_network_links):
        """계단 링크가 제거되고, 제거된 계단의 수와 위치(id)가 메타데이터로 전달되는지 검증."""
        filtered, meta = filter_links_avoiding_stairs(mock_osm_network_links)
        assert all(l["highway"] != "steps" for l in filtered)
        assert len(filtered) == len(mock_osm_network_links) - 1
        assert meta["has_stairs"] is False
        assert meta["stairs_avoidance_applied"] is True
        assert meta["removed_stairs_count"] == 1
        assert meta["removed_stairs_link_ids"] == ["link-steps-01"]

    def test_no_stairs_reports_zero_removed(self):
        """계단이 없는 네트워크에서는 제거 수 0, 링크는 그대로 유지되는지 검증."""
        links = [{"id": "a", "highway": "footway", "length_m": 10.0}]
        filtered, meta = filter_links_avoiding_stairs(links)
        assert filtered == links
        assert meta["removed_stairs_count"] == 0
        assert meta["removed_stairs_link_ids"] == []

    def test_steep_links_over_15_degrees_are_excluded(self):
        """26.8% 이상은 제외하고, 그 미만(급경사 11.2% 포함)은 유지하는지 경계값으로 검증."""
        links = [
            {"id": "gentle", "slope_percent": 2.0},
            {"id": "steep-but-walkable", "slope_percent": 11.2},
            {"id": "just-below", "slope_percent": 26.7},
            {"id": "at-limit", "slope_percent": MAX_WALKABLE_SLOPE_PERCENT},
            {"id": "too-steep", "slope_percent": 40.0},
        ]
        kept, meta = exclude_steep_links(links)
        assert [l["id"] for l in kept] == ["gentle", "steep-but-walkable", "just-below"]
        assert meta["excluded_steep_count"] == 2
        assert meta["excluded_steep_link_ids"] == ["at-limit", "too-steep"]
        assert meta["max_slope_limit_percent"] == 26.8

    @pytest.mark.parametrize(
        "bad_value",
        [None, float("nan"), float("inf"), "12", True],
        ids=["None", "NaN", "inf", "문자열", "bool"],
    )
    def test_unknown_slope_is_kept_but_reported(self, bad_value):
        """경사를 확인할 수 없는 값은 오류 없이 유지하되 미확인으로 보고하는지 검증."""
        kept, meta = exclude_steep_links([{"id": "bad", "slope_percent": bad_value}])
        assert [l["id"] for l in kept] == ["bad"]
        assert meta["excluded_steep_count"] == 0
        assert meta["slope_unknown_count"] == 1
        assert meta["slope_unknown_link_ids"] == ["bad"]

    def test_missing_slope_key_is_reported_as_unknown(self):
        """slope_percent 키가 없는 링크도 평지가 아니라 미확인으로 보고하는지 검증."""
        kept, meta = exclude_steep_links([{"id": "no-slope"}])
        assert [l["id"] for l in kept] == ["no-slope"]
        assert meta["slope_unknown_link_ids"] == ["no-slope"]

    def test_downhill_negative_slope_uses_magnitude(self):
        """내리막(음수) 급경사도 크기로 비교해 제외되는지 검증."""
        links = [
            {"id": "down-steep", "slope_percent": -30.0},
            {"id": "down-gentle", "slope_percent": -3.0},
        ]
        kept, meta = exclude_steep_links(links)
        assert [l["id"] for l in kept] == ["down-gentle"]
        assert meta["excluded_steep_link_ids"] == ["down-steep"]

    def test_no_link_disappears_from_both_lists(self):
        """어떤 값이 들어와도 모든 링크가 유지/제외/미확인 중 하나로 집계되는지 검증."""
        values = [2.0, 30.0, None, float("nan"), -40.0, "x"]
        links = [{"id": f"l{i}", "slope_percent": v} for i, v in enumerate(values)]
        kept, meta = exclude_steep_links(links)
        assert len(kept) + meta["excluded_steep_count"] == len(links)

    def test_original_order_is_preserved(self):
        """유지되는 링크의 원래 순서가 바뀌지 않는지 검증."""
        links = [
            {"id": "a", "slope_percent": 1.0},
            {"id": "b", "slope_percent": None},
            {"id": "c", "slope_percent": 2.0},
        ]
        kept, _ = exclude_steep_links(links)
        assert [l["id"] for l in kept] == ["a", "b", "c"]

    def test_barrier_free_false_when_slope_unknown(self):
        """경사 미확인 링크가 있으면 무장애길(검증됨)로 표시하지 않는지 검증."""
        links = [
            {"id": "ok", "highway": "footway", "slope_percent": 2.0},
            {"id": "unknown", "highway": "footway"},
        ]
        result, meta = apply_barrier_free_constraints(links)
        assert [l["id"] for l in result] == ["ok", "unknown"]
        assert meta["is_barrier_free"] is False
        assert meta["slope_unknown_link_ids"] == ["unknown"]

    def test_barrier_free_true_only_when_all_slopes_verified(self):
        """모든 링크의 경사가 확인되고 한계 미만이면 True 인지 검증."""
        links = [{"id": "ok", "highway": "footway", "slope_percent": 2.0}]
        _, meta = apply_barrier_free_constraints(links)
        assert meta["is_barrier_free"] is True
        assert meta["slope_unknown_count"] == 0

    def test_barrier_free_false_when_no_links_remain(self):
        """남은 링크가 없으면(빈 입력, 전부 제외) 무장애길로 표시하지 않는지 검증."""
        _, empty_meta = apply_barrier_free_constraints([])
        assert empty_meta["is_barrier_free"] is False

        only_hazards = [
            {"id": "s", "highway": "steps", "slope_percent": 5.0},
            {"id": "cliff", "highway": "path", "slope_percent": 40.0},
        ]
        result, meta = apply_barrier_free_constraints(only_hazards)
        assert result == []
        assert meta["is_barrier_free"] is False

    def test_apply_barrier_free_constraints_combines_both(self, mock_osm_network_links):
        """계단 배제와 급경사 배제가 함께 적용되고 메타데이터가 합쳐지는지 검증."""
        links = mock_osm_network_links + [
            {"id": "link-cliff", "highway": "path", "length_m": 20.0, "slope_percent": 35.0},
        ]
        result, meta = apply_barrier_free_constraints(links)
        ids = [l["id"] for l in result]
        assert "link-steps-01" not in ids
        assert "link-cliff" not in ids
        assert "link-steep-01" in ids  # 11.2% 는 15도 미만이므로 유지
        assert meta["is_barrier_free"] is True
        assert meta["removed_stairs_count"] == 1
        assert meta["excluded_steep_count"] == 1
