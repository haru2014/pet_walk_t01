"""[US-A3, US-B1, US-B3] 실제 도로망 산책 경로 지오메트리 무결성 자동 검증 테스트.

검증 항목:
1. 순환 폐곡선 종결성 (출발점-도착점 거리 <= 15m)
2. 왕복(Backtracking / Spur) 구간 비율 15% 이하 유지
3. 목표 거리/시간 대비 실측 오차율 +-15% 이내 수렴 (체급별 속도 모델 연계)
4. 턴바이턴 안내 핀의 Polyline 상 위치 및 스텝 거리 합계 일치
5. 출발지(Origin) 반영 및 원격지 고정 코스 반환 문제 방지
6. main.py API 엔드포인트 파라미터 유실 없는 전달
"""

import pytest
from typing import Dict, Any

from agent.walk_planning_agent import (
    run_walk_planning_agent,
    LoopCandidateRequest,
    generate_loop_candidates,
    get_standard_speed_kmh,
)
from agent.route_geometry import (
    haversine_m,
    polyline_length_m,
    loop_closure_gap_m,
    backtrack_ratio,
)
from main import plan_walk_route


class TestRouteGeometryIntegrity:
    """[US-A3] 경로 지오메트리 실측 및 순환 무결성 검증 스위트."""

    @pytest.mark.parametrize("origin_lat, origin_lon, label", [
        (37.5665, 126.9780, "서울시청"),
        (37.4979, 127.0276, "강남역"),
        (37.5446, 127.0374, "성수_서울숲"),
    ])
    def test_route_loop_closure(self, origin_lat: float, origin_lon: float, label: str):
        """1. 모든 순환 후보 경로는 출발점과 도착점이 15m 이내로 연결되어야 한다."""
        req = LoopCandidateRequest(
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            target_distance_m=1200.0,
            speed_kmh=2.8,
            avoid_stairs=True,
        )
        candidates = generate_loop_candidates(req)
        assert len(candidates) == 3, f"{label}: 3개 후보가 생성되어야 함"

        for cand in candidates:
            coords = cand.geojson_coordinates
            assert len(coords) >= 4, f"{cand.name}: 유효한 폴리라인이어야 함"
            gap_m = loop_closure_gap_m(coords)
            assert gap_m <= 15.0, (
                f"{label} {cand.name}: 출발점-도착점 오차({gap_m:.1f}m)는 15m 이하여야 함"
            )

    @pytest.mark.parametrize("variant_idx", [0, 1, 2])
    def test_backtracking_spur_ratio_under_15_percent(self, variant_idx: int):
        """2. 동일 경로를 되돌아 걷는 왕복 구간 비율은 15% 이하여야 한다."""
        req = LoopCandidateRequest(
            origin_lat=37.5665,
            origin_lon=126.9780,
            target_distance_m=1500.0,
            speed_kmh=3.6,
            avoid_stairs=True,
        )
        candidates = generate_loop_candidates(req)
        if variant_idx >= len(candidates):
            pytest.skip("실제 길 기반 코스를 못 만든 후보는 제외된다 (OSRM 장애 시)")
        cand = candidates[variant_idx]
        ratio = backtrack_ratio(cand.geojson_coordinates)
        assert ratio <= 0.15, (
            f"{cand.name}: 왕복(되돌아가기) 비율({ratio * 100:.1f}%)이 15% 초과함"
        )

    @pytest.mark.parametrize("duration_min, weight_kg, age_years, joint_level, expected_speed", [
        (20, 3.2, 9, 2, 2.2),   # 노령견 / 관절안심: 2.2 km/h
        (30, 4.0, 3, 0, 2.8),   # 소형견: 2.8 km/h
        (30, 15.0, 4, 0, 3.6),  # 중형견: 3.6 km/h
        (45, 30.0, 3, 0, 4.2),  # 대형견: 4.2 km/h
    ])
    def test_duration_and_distance_error_within_15_percent(
        self, duration_min: int, weight_kg: float, age_years: int, joint_level: int, expected_speed: float
    ):
        """3. 목표 시간 및 반려견 속도 기반 목표 거리 대비 실제 지오메트리 오차가 +-15% 이내여야 한다."""
        speed = get_standard_speed_kmh(weight_kg, age_years, joint_level)
        assert speed == expected_speed

        target_dist_m = (speed * 1000.0 / 60.0) * duration_min

        result = run_walk_planning_agent(
            user_query=f"{duration_min}분 동안 완만한 길로 걷고 싶어요",
            client_dog_context={
                "dog_id": "dog_test",
                "name": "테스트견",
                "breed": "테스트",
                "age_years": age_years,
                "weight_kg": weight_kg,
                "joint_care_level": joint_level,
            },
            origin_lat=37.5665,
            origin_lon=126.9780,
        )

        best = result.best_route
        measured_dist_m = polyline_length_m(best.geojson_coordinates)

        # 1) Candidate total_distance_m 은 지오메트리 실측치와 일치해야 함
        assert abs(best.total_distance_m - measured_dist_m) <= 5.0

        # 2) 목표 거리 대비 오차율 15% (0.15) 이내 수렴
        error_rate = abs(measured_dist_m - target_dist_m) / target_dist_m
        assert error_rate <= 0.15, (
            f"목표 거리 {target_dist_m:.0f}m 대비 실측 {measured_dist_m:.0f}m 오차율({error_rate * 100:.1f}%) 초과"
        )

    def test_turn_step_pins_on_polyline_and_sum_matches(self):
        """4. 턴바이턴 안내 핀은 Polyline 위에 존재하고, 스텝 거리 합계는 총거리와 일치해야 한다."""
        req = LoopCandidateRequest(
            origin_lat=37.5665,
            origin_lon=126.9780,
            target_distance_m=1000.0,
            speed_kmh=2.8,
        )
        candidates = generate_loop_candidates(req)
        best = candidates[0]

        # 1) 스텝 핀 좌표가 Polyline 좌표열의 점 중 하나와 일치하거나 극근접(2m 이내)
        coords = best.geojson_coordinates
        for step in best.turn_by_turn_steps:
            pos = step["position"]
            min_dist_to_coord = min(haversine_m(pos, c) for c in coords)
            assert min_dist_to_coord <= 2.0, f"스텝 핀 {pos}이 폴리라인 좌표열에 속하지 않음"

        # 2) 스텝별 거리 합계가 총거리와 일치 (정수 반올림 오차 +-3m 이내)
        sum_step_dist = sum(s["distance_m"] for s in best.turn_by_turn_steps)
        assert abs(sum_step_dist - best.total_distance_m) <= 3.0, (
            f"스텝 거리 합계({sum_step_dist}m)와 총거리({best.total_distance_m}m) 불일치"
        )

    def test_origin_displacement_creates_routes_near_origin(self):
        """5. 강남역에서 요청 시 서울시청이 아닌 강남역 출발지 근방(100m 이내)에서 시작해야 한다."""
        gangnam_lat, gangnam_lon = 37.4979, 127.0276
        result = run_walk_planning_agent(
            user_query="강남역에서 20분 산책",
            client_dog_context={"dog_id": "dog_gn", "name": "강남이"},
            origin_lat=gangnam_lat,
            origin_lon=gangnam_lon,
        )
        best = result.best_route
        start_pt = best.geojson_coordinates[0]
        dist_from_origin = haversine_m((gangnam_lon, gangnam_lat), start_pt)
        assert dist_from_origin <= 100.0, (
            f"출발지(강남역)와 경로 시작점 사이 거리({dist_from_origin:.1f}m)가 100m를 초과함 (원격지 고정 코스 오류)"
        )

    def test_main_api_passthrough_parameters(self):
        """6. main.py /api/v1/walk/plan 호출 시 반려견 맞춤 파라미터가 유실 없이 계산에 반영되어야 한다."""
        payload = {
            "dog_name": "초코",
            "breed": "토이 푸들",
            "age_years": 11,
            "weight_kg": 3.8,
            "speed_kmh": 2.2,
            "joint_care_level": 3,
            "target_duration_minutes": 20,
            "origin_lat": 37.5665,
            "origin_lon": 126.9780,
        }
        res = plan_walk_route(payload)
        assert res["is_live_server"] is True
        assert len(res["courses"]) >= 1

        first_course = res["courses"][0]
        # 2.2 km/h * (20/60) = 733m -> 약 0.7km
        assert "0.7 km" in first_course["distanceKm"] or "0.8 km" in first_course["distanceKm"]
        assert first_course["estimatedMinutes"] in (19, 20, 21)
