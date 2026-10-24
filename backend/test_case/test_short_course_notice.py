"""[#229] 공원 보행로가 짧아 목표보다 짧은 코스가 나오면 카드 안내 줄(reason)에 이유를 알린다."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

import main
from agent.pilot_park_routes import PILOT_PARK_CENTERS

client = TestClient(main.app)


def _cand(distance_m, minutes):
    return SimpleNamespace(total_distance_m=distance_m, estimated_duration_minutes=minutes)


def test_short_courses_get_notice_with_longest_minutes():
    courses = [{"reason": "a"}, {"reason": "b"}, {"reason": "c"}]
    cands = [_cand(2800, 60), _cand(2100, 45), _cand(1700, 36)]
    main._add_short_course_notice(courses, cands, 5600)
    assert all("산책로가 짧아 최대 약 60분" in c["reason"] for c in courses)


def test_only_short_course_changes_when_some_reach_target():
    courses = [{"reason": "a"}, {"reason": "b"}]
    main._add_short_course_notice(courses, [_cand(2000, 43), _cand(1000, 21)], 2000)
    assert courses[0]["reason"] == "a"
    assert "최대 약 43분" in courses[1]["reason"]


def test_no_notice_when_courses_are_close_to_target():
    courses = [{"reason": "a"}]
    main._add_short_course_notice(courses, [_cand(1700, 36)], 2000)  # 85%
    assert courses == [{"reason": "a"}]


def _plan(park, minutes):
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    res = client.post("/api/v1/walk/plan", json={
        "target_duration_minutes": minutes, "speed_kmh": 2.8,
        "origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": park,
    })
    assert res.status_code == 200, res.text
    return res.json()


def test_songgang_120_minutes_shows_notice():
    reasons = [c["reason"] for c in _plan("songgang", 120)["courses"]]
    assert all("산책로가 짧아" in r for r in reasons)


def test_songgang_20_minutes_has_no_notice():
    reasons = [c["reason"] for c in _plan("songgang", 20)["courses"]]
    assert not any("산책로가 짧아" in r for r in reasons)
