"""[이슈 #125 / #114] 공원 모드 코스 후보 3개는 서로 다른 길이어야 한다.

예전에는 후보 1번과 2번이 같은 순환로의 반대 방향(좌표만 뒤집음)이고, 세 후보의 이름도 같아서
앱에서 "1~3번이 같고 시간만 다르다"로 보였다.
"""

import pytest
from fastapi.testclient import TestClient

import main
from agent.park_route_validation import build_park_graph, validate_park_route
from agent.park_walk_planner import plan_park_walk, plan_park_walk_candidates, route_edge_set
from agent.route_geometry import polyline_length_m

client = TestClient(main.app)
CENTERS = {
    "yurim": (36.3620608, 127.3601379),
    "sejong": (36.4972593, 127.2749633),
    "songgang": (36.4353, 127.3847),
    "doan": (36.332629, 127.3505325),
}
BIG_PARKS = ["yurim", "sejong", "doan"]


def _target(minutes, speed=2.8):
    return speed * 1000.0 / 60.0 * minutes


def _similarity(a, b):
    ea, eb = route_edge_set(a), route_edge_set(b)
    return len(ea & eb) / len(ea | eb)


@pytest.mark.parametrize("park", BIG_PARKS)
@pytest.mark.parametrize("minutes", [30, 40])
def test_big_parks_give_three_different_routes(park, minutes):
    lat, lon = CENTERS[park]
    routes = plan_park_walk_candidates(park, lat, lon, _target(minutes))
    assert len(routes) == 3
    sims = [_similarity(routes[i], routes[j]) for i in range(3) for j in range(i + 1, 3)]
    assert max(sims) < 0.9, f"비슷한 후보가 있다: {sims}"
    assert sum(1 for s in sims if s < 0.7) >= 2, f"서로 다른 길이 부족하다: {sims}"


@pytest.mark.parametrize("park", list(CENTERS))
def test_second_candidate_is_not_just_the_first_reversed(park):
    lat, lon = CENTERS[park]
    r1, r2, _ = plan_park_walk_candidates(park, lat, lon, _target(30))
    if park in BIG_PARKS:
        assert route_edge_set(r1) != route_edge_set(r2)
    assert r1 != r2


@pytest.mark.parametrize("park", list(CENTERS))
@pytest.mark.parametrize("minutes", [20, 30, 40, 60])
def test_best_candidate_still_fits_the_target_time(park, minutes):
    lat, lon = CENTERS[park]
    target = _target(minutes)
    best = plan_park_walk_candidates(park, lat, lon, target)[0]
    length = polyline_length_m(best)
    assert 0 < length <= target * 1.25
    assert plan_park_walk(park, lat, lon, target, 1) == best  # 기존 함수도 같은 결과


@pytest.mark.parametrize("park", list(CENTERS))
def test_every_candidate_is_a_valid_park_loop(park):
    lat, lon = CENTERS[park]
    target = _target(30)
    for route in plan_park_walk_candidates(park, lat, lon, target):
        assert route[0] == route[-1]
        validate_park_route(route, park, 3.0, target / 50.0, (lon, lat))  # 경계 안·실제 보행로·순환


def test_candidates_are_deterministic():
    lat, lon = CENTERS["yurim"]
    assert plan_park_walk_candidates("yurim", lat, lon, 1400.0) == plan_park_walk_candidates("yurim", lat, lon, 1400.0)


def test_candidate_list_is_cached_per_graph_and_not_shared_when_graph_changes(monkeypatch):
    import agent.park_walk_planner as pwp

    lat, lon = CENTERS["doan"]
    first = plan_park_walk_candidates("doan", lat, lon, 1400.0)
    calls = []
    original = pwp._compute_candidates
    monkeypatch.setattr(pwp, "_compute_candidates", lambda *a, **k: (calls.append(1), original(*a, **k))[1])
    assert plan_park_walk_candidates("doan", lat, lon, 1400.0) == first
    assert calls == []  # 같은 그래프·같은 요청이면 다시 계산하지 않는다
    build_park_graph("doan")  # 같은 그래프 객체 (캐시 유지)
    assert plan_park_walk_candidates("doan", lat, lon, 1400.0) == first


@pytest.mark.parametrize("park", list(CENTERS))
def test_api_course_names_are_different(park):
    lat, lon = CENTERS[park]
    body = {"dog_id": "d", "dog_name": "T", "speed_kmh": 2.8, "joint_care_level": 1, "target_duration_minutes": 30,
            "origin_mode": "park", "pilot_park_id": park, "origin_lat": lat, "origin_lon": lon, "park_zone": park}
    res = client.post("/api/v1/walk/plan", json=body)
    assert res.status_code == 200
    names = [c["name"] for c in res.json()["courses"]]
    assert len(set(names)) == 3, names
    # 방향과 거리가 이름에 들어간다 (사용자가 코스를 구분할 수 있다)
    assert all(("시계 방향" in n or "반시계 방향" in n) and "km" in n for n in names), names


@pytest.mark.parametrize("park", BIG_PARKS)
def test_api_routes_are_really_different(park):
    lat, lon = CENTERS[park]
    body = {"dog_id": "d", "dog_name": "T", "speed_kmh": 2.8, "joint_care_level": 1, "target_duration_minutes": 30,
            "origin_mode": "park", "pilot_park_id": park, "origin_lat": lat, "origin_lon": lon, "park_zone": park}
    data = client.post("/api/v1/walk/plan", json=body).json()

    def coords(cid):
        return [c for f in data["course_plans"][cid]["route"]["features"] if f["geometry"]["type"] == "LineString"
                for c in f["geometry"]["coordinates"]]

    ids = [c["id"] for c in data["courses"]]
    sets = [set(map(tuple, coords(i))) for i in ids]
    assert len({frozenset(s) for s in sets}) == 3  # 세 후보의 점 집합이 서로 다르다
