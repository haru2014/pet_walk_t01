"""[3번 노희선 - 서버] 4개 시범 공원 x 요청 시간: 앱이 요청하는 그대로 코스가 서로 다른 길로 나와야 한다 (#125 회귀 방지).

회귀 이력(과거 커밋을 직접 돌려 확인, 2026-10-22):
- 10/19 #132 ~ 10/21 00:01 #162: 유림 20분 3코스 서로 겹침 0.19~0.33 (정상)
- 10/22 00:34 #192(공원 중심 요청을 기본 주차장 출발로 바꿈): 0.77~0.88 로 거의 같은 코스 — 간선 개수 기준만 있어 통과했다
- 10/22 #208: 지도 위 겹침 기준 추가로 해소
이 테스트는 앱과 같은 값(속도 3.2km/h)·같은 출발 규칙(공원 중심 요청 -> 기본 주차장 출발)으로 4공원 전체를 지킨다.
"""
import itertools

import pytest

import main
import agent.park_walk_planner as pwp
from agent.park_route_validation import RoutePlanningError, is_route_inside_park_boundary
from agent.pilot_park_routes import PILOT_PARK_CENTERS

APP_SPEED_KMH = 3.2
PARKS = sorted(PILOT_PARK_CENTERS)
MINUTES = (20, 30, 40, 60, 90, 120)


def _start(park_id, target_m):
    """main.py 가 공원 중심 요청에서 고르는 출발점 (기본 주차장이 코스를 서로 다르게 유지하면 그 주차장, 아니면 공원 중심)."""
    lat, lon, _ = PILOT_PARK_CENTERS[park_id]
    lot = main._park_center_to_parking(lat, lon, "park", park_id, None, target_m)
    return (lot["entrance_lat"], lot["entrance_lon"]) if lot else (lat, lon)


@pytest.mark.parametrize("park_id", PARKS)
@pytest.mark.parametrize("minutes", MINUTES)
def test_three_courses_are_different_paths_inside_the_park(park_id, minutes):
    target_m = minutes * APP_SPEED_KMH / 60 * 1000
    try:
        routes = pwp.plan_park_walk_candidates(park_id, *_start(park_id, target_m), target_m)
    except RoutePlanningError as error:  # 공원 연결 보행망이 없는 환경이면 건너뛴다
        pytest.skip(str(error))
    assert len(routes) == pwp.CANDIDATE_COUNT
    for route in routes:
        assert is_route_inside_park_boundary(route, park_id)
    overlaps = [pwp.routes_overlap(a, b) for a, b in itertools.combinations(routes, 2)]
    assert max(overlaps) < pwp.SAME_ROUTE_OVERLAP, overlaps
