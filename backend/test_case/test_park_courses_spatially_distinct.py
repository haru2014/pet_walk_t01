"""[3번 노희선 - 서버] 공원 코스 3개는 지도 위에서도 서로 다른 길이어야 한다 (#125).

운영 QA(2026-10-22, 지도로 확인): 유림공원 20분 3개 코스가 간선 겹침 0.55~0.61(기준 0.65 미만)이라 '다른 길'로
통과했지만, 지도에서는 77~88% 가 서로 겹쳤다 (20m 안, 서로 겹침 비율 중 작은 값) (같은 길을 조금씩 다른 점으로 이은 코스, 나란한 보행로).
간선 개수만 세던 비교에 '20m 안에 붙어 있는 비율'을 더했다.
"""
import itertools

import agent.park_walk_planner as pwp

YURIM_LOT = (36.36038081, 127.3551748)  # 유림공원 기본 주차장 진입점
TARGET_M = 20 * 2800 / 60  # 20분, 2.8km/h


def _line(offset_m, points=30, length_m=300.0):
    """동쪽으로 뻗는 직선 (offset_m 만큼 북쪽으로 옮김)."""
    lat0, lon0 = 36.36, 127.355
    dlon = length_m / (111320.0 * 0.805) / (points - 1)
    return [[lon0 + i * dlon, lat0 + offset_m / 110540.0] for i in range(points)]


def test_parallel_routes_few_meters_apart_are_the_same_path():
    assert pwp.routes_overlap(_line(0), _line(5)) > 0.95


def test_route_lying_inside_a_longer_one_is_not_the_same_path():
    """짧은 코스가 긴 코스의 일부분에 통째로 포함돼도 다른 코스다 (서로 닮은 게 아니다)."""
    assert pwp.routes_overlap(_line(0, points=30, length_m=300.0), _line(0, points=30, length_m=1200.0)) < pwp.SAME_ROUTE_OVERLAP


def test_routes_far_apart_are_different_paths():
    assert pwp.routes_overlap(_line(0), _line(100)) == 0.0


def test_select_distinct_skips_candidate_running_beside_a_chosen_route():
    """간선 집합은 겹치지 않아도 5m 옆을 나란히 가는 후보는 고르지 않는다."""
    base, beside, far = _line(0), _line(5, points=29), _line(100)

    def cand(coords, tag):
        return (0.0, frozenset({frozenset({("edge", tag)})}), lambda c=coords: c)

    routes = pwp._select_distinct([cand(base, 1), cand(beside, 2), cand(far, 3)])
    assert routes[0] == base and routes[1] == far


def test_yurim_parking_start_gives_three_different_paths():
    routes = pwp.plan_park_walk_candidates("yurim", *YURIM_LOT, TARGET_M)
    overlaps = [pwp.routes_overlap(a, b) for a, b in itertools.combinations(routes, 2)]
    assert max(overlaps) < pwp.SAME_ROUTE_OVERLAP
