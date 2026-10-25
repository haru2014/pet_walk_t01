"""[#258] 좁은 갈림길을 헤집어 꼬불꼬불한 코스는 카드 안내 줄(reason)에 이유를 알린다."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

import main
from agent.park_walk_planner import WINDING_RATIO_NOTICE, winding_ratio
from agent.pilot_park_routes import PILOT_PARK_CENTERS

client = TestClient(main.app)

LON0, LAT0 = 127.3500, 36.3600
M = 0.0000112  # 약 1m (위도·경도 모두 거의 같은 크기로 쓴다)


def _p(east_m, north_m):
    return [LON0 + east_m * M * 1.25, LAT0 + north_m * M]


def _ring(side_m=100):
    pts = [_p(0, 0), _p(side_m, 0), _p(side_m, side_m), _p(0, side_m), _p(0, 0)]
    return pts


def _comb(teeth=20, spur_m=100, gap_m=10):
    """큰길 하나에 짧은 가지가 여러 개 달린 코스: 각 가지를 갔다가 되돌아온다."""
    pts = [_p(0, 0)]
    for i in range(teeth):
        x = i * gap_m
        pts += [_p(x, 0), _p(x, spur_m), _p(x, 0)]
    return pts


def test_ring_is_not_winding():
    assert 0.9 <= winding_ratio(_ring()) <= 1.1


def test_out_and_back_line_is_not_winding():
    line = [_p(0, 0), _p(200, 0), _p(0, 0)]
    assert winding_ratio(line) < 1.1


def test_comb_is_winding():
    assert winding_ratio(_comb()) > WINDING_RATIO_NOTICE


def test_repeated_laps_do_not_count_as_winding():
    assert 0.9 <= winding_ratio(_ring() * 4) <= 1.1


def test_notice_added_only_to_winding_courses():
    courses = [{"reason": "a"}, {"reason": "b"}]
    cands = [SimpleNamespace(geojson_coordinates=_comb()), SimpleNamespace(geojson_coordinates=_ring())]
    main._add_winding_notice(courses, cands)
    assert courses[0]["reason"] == "a\n갈림길이 많아 코스가 꼬불꼬불해요."
    assert courses[1]["reason"] == "b"


def _plan(park, minutes):
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    res = client.post("/api/v1/walk/plan", json={
        "target_duration_minutes": minutes, "speed_kmh": 2.8,
        "origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": park,
    })
    assert res.status_code == 200, res.text
    return [c["reason"] for c in res.json()["courses"]]


def test_doan_60_minutes_first_course_gets_notice():
    assert any("꼬불꼬불" in r for r in _plan("doan", 60))


def test_other_parks_have_no_winding_notice():
    for park in ("sejong", "yurim", "songgang"):
        assert not any("꼬불꼬불" in r for r in _plan(park, 60)), park


def test_doan_60_minutes_notice_field():
    lat, lon, _ = PILOT_PARK_CENTERS["doan"]
    res = client.post("/api/v1/walk/plan", json={
        "target_duration_minutes": 60, "speed_kmh": 2.8,
        "origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": "doan",
    })
    notices = [c.get("notice") for c in res.json()["courses"]]
    assert sum(1 for n in notices if n and "꼬불꼬불" in n) == 1
