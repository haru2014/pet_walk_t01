"""[이슈 #65] 공원 모드 경로 가드레일 회귀 테스트.

- 송강근린공원 정적 코스가 공원 밖(남쪽 시가지)으로 나가지 않는다.
- 정적 공원 코스가 사용자 목표 시간(거리)을 크게 넘지 않는다.
- 경계 검사가 실제로 호출되고, 경계 데이터가 없거나 어긋나면 성공 응답을 내지 않는다.
- 응답의 거리는 최종 좌표열에서 다시 계산한 값이다.
"""

import re

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon

import agent.pilot_park_routes as ppr
from agent.loop_route_planner import _plan_static_pilot_park, polyline_length_m
from main import app

client = TestClient(app)

SONGGANG_CENTER = (36.4315, 127.3805)
# 이슈 #65 보고: 남쪽 이탈 구간(송강초·송강성당·상가)은 위도 36.4292~36.4305.
SONGGANG_REPORTED_OUTSIDE_LAT = 36.4305


def _target_m(minutes: float, speed_kmh: float = 2.8) -> float:
    return speed_kmh * 1000.0 / 60.0 * minutes


def _plan_body(park_id: str, minutes: int, lat: float, lon: float) -> dict:
    return {
        "dog_id": "dog-test",
        "dog_name": "초코",
        "speed_kmh": 2.8,
        "joint_care_level": 1,
        "target_duration_minutes": minutes,
        "origin_mode": "park",
        "pilot_park_id": park_id,
        "origin_lat": lat,
        "origin_lon": lon,
        "park_zone": park_id,
    }


def test_songgang_static_route_has_no_point_in_reported_outside_area():
    coords = ppr.SONGGANG_PARK_OSM_COORDS
    assert min(p[1] for p in coords) > SONGGANG_REPORTED_OUTSIDE_LAT
    assert coords[0] == coords[-1], "순환 코스는 출발점으로 돌아와야 한다"


@pytest.mark.parametrize("park_id", ["sejong", "yurim", "songgang", "doan"])
@pytest.mark.parametrize("minutes", [30, 40])
def test_static_park_plan_does_not_exceed_target_much(park_id, minutes):
    lat, lon, _ = ppr.PILOT_PARK_CENTERS[park_id]
    target = _target_m(minutes)
    plan = _plan_static_pilot_park(lat, lon, 1, pilot_park_id=park_id, target_distance_m=target)
    assert plan is not None and plan.coords
    assert plan.distance_m <= target * 1.25 + 1.0


@pytest.mark.parametrize("variant", [1, 2, 3])
def test_trimmed_plan_returns_to_start_and_distance_matches_coords(variant):
    lat, lon, _ = ppr.PILOT_PARK_CENTERS["yurim"]
    plan = _plan_static_pilot_park(lat, lon, variant, pilot_park_id="yurim", target_distance_m=_target_m(30))
    assert plan.coords[0] == plan.coords[-1]
    assert plan.distance_m == pytest.approx(polyline_length_m(plan.coords), abs=1.0)


def test_short_static_loop_is_kept_as_is():
    """목표보다 짧거나 비슷한 코스는 자르지 않는다(도안호수공원 약 1.5km)."""
    lat, lon, _ = ppr.PILOT_PARK_CENTERS["doan"]
    plan = _plan_static_pilot_park(lat, lon, 1, pilot_park_id="doan", target_distance_m=_target_m(40))
    assert plan.distance_m == pytest.approx(polyline_length_m(ppr.DOAN_PARK_OSM_COORDS), abs=1.0)


def test_boundary_check_is_fail_closed_for_unknown_park():
    assert ppr.is_route_inside_park_boundary([[127.0, 36.0], [127.001, 36.001]], "no_such_park") is False


def test_static_plan_is_blocked_when_boundary_does_not_contain_route(monkeypatch):
    far_box = Polygon([(127.5, 36.5), (127.51, 36.5), (127.51, 36.51), (127.5, 36.51)])
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"songgang": far_box})
    plan = _plan_static_pilot_park(*SONGGANG_CENTER, 1, pilot_park_id="songgang", target_distance_m=_target_m(40))
    assert plan is not None
    assert plan.coords == []
    assert plan.source == "park_boundary_violation"


def test_api_returns_422_when_boundary_blocks_route(monkeypatch):
    far_box = Polygon([(127.5, 36.5), (127.51, 36.5), (127.51, 36.51), (127.5, 36.51)])
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"songgang": far_box})
    res = client.post("/api/v1/walk/plan", json=_plan_body("songgang", 40, *SONGGANG_CENTER))
    assert res.status_code == 422


def test_api_songgang_40min_stays_north_and_near_target():
    res = client.post("/api/v1/walk/plan", json=_plan_body("songgang", 40, *SONGGANG_CENTER))
    assert res.status_code == 200
    body = res.json()
    target_km = _target_m(40) / 1000.0
    for course in body["courses"]:
        km = float(re.search(r"[\d.]+", course["distanceKm"]).group())
        assert km <= target_km * 1.25 + 0.05, course
    lats = []
    for plan in body["course_plans"].values():
        for feature in plan["route"]["features"]:
            if feature["geometry"]["type"] == "LineString":
                lats += [pt[1] for pt in feature["geometry"]["coordinates"]]
    assert lats and min(lats) > SONGGANG_REPORTED_OUTSIDE_LAT
