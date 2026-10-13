"""[US-A3, US-B1] 건물 관통 방지(Building Avoidance) 공간 교차 자동 검증 테스트.

검증 내용:
1. 주요 테스트 권역(서울시청, 강남역, 성수 서울숲)에서 생성된 산책 경로가
   실제 건물 외곽선 폴리곤(Building Polygon)을 사선이나 대각선으로 관통하지 않는지 검증.
2. 건물 관통 선분 비율 0.0% 달성 여부 검증 (Zero Building Penetration).
"""

import pytest
from pathlib import Path
from typing import List
from shapely.geometry import Polygon

from agent.walk_planning_agent import (
    LoopCandidateRequest,
    generate_loop_candidates,
    run_walk_planning_agent,
)
from agent.building_geometry import (
    load_building_polygons,
    count_building_penetrations,
    verify_building_avoidance,
)
from agent.loop_route_planner import plan_loop_candidates


FIXTURES_DIR = Path(__file__).parent.parent / "fixtures"


@pytest.fixture(scope="session")
def seoul_center_buildings() -> List[Polygon]:
    """서울 도심 (시청/덕수궁/프레스센터 등) 건물 외곽선 폴리곤 Fixture."""
    path = FIXTURES_DIR / "building_polygons_seoul_center.json"
    polys = load_building_polygons(path)
    assert len(polys) > 0, f"서울 도심 건물 폴리곤 파일이 존재해야 합니다: {path}"
    return polys


@pytest.fixture(scope="session")
def gangnam_buildings() -> List[Polygon]:
    """강남역 (삼성타운/메리츠타워 등) 건물 외곽선 폴리곤 Fixture."""
    path = FIXTURES_DIR / "building_polygons_gangnam.json"
    polys = load_building_polygons(path)
    assert len(polys) > 0, f"강남역 건물 폴리곤 파일이 존재해야 합니다: {path}"
    return polys


@pytest.fixture(scope="session")
def seoul_forest_buildings() -> List[Polygon]:
    """서울숲 (아크로/갤러리아포레/디타워) 건물 외곽선 폴리곤 Fixture."""
    path = FIXTURES_DIR / "building_polygons_seoul_forest.json"
    polys = load_building_polygons(path)
    assert len(polys) > 0, f"서울숲 건물 폴리곤 파일이 존재해야 합니다: {path}"
    return polys


class TestBuildingAvoidanceSpatialIntegrity:
    """[US-A3] 건물 관통 0% 공간 기하 검증 스위트."""

    @pytest.fixture(autouse=True)
    def use_offline_routes(self, monkeypatch: pytest.MonkeyPatch):
        """건물 회피 검증은 외부 OSRM 응답 변동 없이 재현 가능해야 한다."""
        monkeypatch.setattr("agent.loop_route_planner.fetch_osrm_foot_route", lambda *args, **kwargs: None)

    def test_seoul_center_route_zero_building_penetration(self, seoul_center_buildings: List[Polygon]):
        """서울광장 출발 경로 3종이 시청사, 도서관, 호텔 등 도심 건물을 관통하지 않아야 한다."""
        req = LoopCandidateRequest(
            origin_lat=37.5665,
            origin_lon=126.9780,
            target_distance_m=1200.0,
            speed_kmh=2.8,
            avoid_stairs=True,
        )
        candidates = generate_loop_candidates(req)
        assert len(candidates) == 3

        for cand in candidates:
            coords = cand.geojson_coordinates
            cnt, total, ratio, details = count_building_penetrations(coords, seoul_center_buildings)
            assert ratio == 0.0, (
                f"{cand.name}: 서울시청 권역 건물 관통 선분 발견 ({cnt}/{total}건, {ratio*100:.1f}%). "
                f"상세: {details[:2]}"
            )

    def test_supported_area_offline_route_uses_safe_walk_network(
        self,
        seoul_center_buildings: List[Polygon],
        monkeypatch: pytest.MonkeyPatch,
    ):
        """OSRM 장애 시에도 지원 권역은 목표 거리 오차보다 보행망 경로를 우선한다."""
        monkeypatch.setattr("agent.loop_route_planner.fetch_osrm_foot_route", lambda *args, **kwargs: None)

        plans = plan_loop_candidates(37.5665, 126.9780, 1234.0)

        assert len(plans) == 3
        assert all(plan.source in {"offline_network", "static_seoul"} for plan in plans.values())
        assert all(plan.distance_m > 0 for plan in plans.values())
        assert all(len(plan.coords) > 10 for plan in plans.values())
        assert len({round(plan.distance_m) for plan in plans.values()}) == 3
        for plan in plans.values():
            assert count_building_penetrations(plan.coords, seoul_center_buildings)[2] == 0.0


    def test_gangnam_route_zero_building_penetration(self, gangnam_buildings: List[Polygon]):
        """강남역 출발 경로가 삼성타운/메리츠타워 등 대형 오피스 빌딩을 관통하지 않아야 한다."""
        req = LoopCandidateRequest(
            origin_lat=37.4979,
            origin_lon=127.0276,
            target_distance_m=1000.0,
            speed_kmh=3.6,
            avoid_stairs=True,
        )
        candidates = generate_loop_candidates(req)
        assert len(candidates) == 3

        for cand in candidates:
            coords = cand.geojson_coordinates
            cnt, total, ratio, details = count_building_penetrations(coords, gangnam_buildings)
            assert ratio == 0.0, (
                f"{cand.name}: 강남역 권역 건물 관통 선분 발견 ({cnt}/{total}건, {ratio*100:.1f}%). "
                f"상세: {details[:2]}"
            )

    def test_seoul_forest_route_zero_building_penetration(self, seoul_forest_buildings: List[Polygon]):
        """서울숲 출발 경로가 아크로포레스트/갤러리아포레 등 주상복합 건물을 관통하지 않아야 한다."""
        req = LoopCandidateRequest(
            origin_lat=37.5446,
            origin_lon=127.0374,
            target_distance_m=1500.0,
            speed_kmh=2.8,
            avoid_stairs=True,
        )
        candidates = generate_loop_candidates(req)
        assert len(candidates) == 3

        for cand in candidates:
            coords = cand.geojson_coordinates
            cnt, total, ratio, details = count_building_penetrations(coords, seoul_forest_buildings)
            assert ratio == 0.0, (
                f"{cand.name}: 서울숲 권역 건물 관통 선분 발견 ({cnt}/{total}건, {ratio*100:.1f}%). "
                f"상세: {details[:2]}"
            )

    def test_end_to_end_agent_walk_plan_avoids_buildings(self, seoul_center_buildings: List[Polygon]):
        """Agent 통합 실행 결과(best_route)가 건물 폴리곤을 전혀 관통하지 않음을 검증."""
        result = run_walk_planning_agent(
            user_query="서울시청 앞에서 25분 동안 안전하게 산책하고 싶어",
            client_dog_context={
                "dog_id": "dog_center",
                "name": "초코",
                "breed": "말티즈",
                "age_years": 4,
                "weight_kg": 3.8,
                "joint_care_level": 1,
            },
            origin_lat=37.5665,
            origin_lon=126.9780,
        )
        best = result.best_route
        is_avoided = verify_building_avoidance(best.geojson_coordinates, seoul_center_buildings)
        assert is_avoided is True, f"에이전트 추천 최적 경로({best.name})가 건물 폴리곤을 관통함"
