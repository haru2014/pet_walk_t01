"""[#229] 공원 보행로가 짧아 목표보다 짧은 코스가 나오면 카드 안내 줄(reason)에 이유를 알린다."""

from types import SimpleNamespace

from fastapi.testclient import TestClient

import main
from agent.pilot_park_routes import PILOT_PARK_CENTERS

client = TestClient(main.app)


def _cand(distance_m, minutes, lap_count=1, lap_cycle_m=None):
    return SimpleNamespace(total_distance_m=distance_m, estimated_duration_minutes=minutes,
                           lap_count=lap_count, lap_cycle_m=lap_cycle_m)


def test_short_courses_get_notice_with_longest_minutes():
    courses = [{"reason": "a"}, {"reason": "b"}, {"reason": "c"}]
    cands = [_cand(2800, 60), _cand(2100, 45), _cand(1700, 36)]
    main._add_short_course_notice(courses, cands, 5600)
    assert all("산책로가 짧아 최대 약 60분" in c["reason"] for c in courses)


def test_no_notice_when_any_course_reaches_target():
    """목표 길이의 코스가 하나라도 있으면 짧은 대안 카드에도 문구를 붙이지 않는다 (#259: 20분 카드에 "최대 60분")."""
    courses = [{"reason": "a"}, {"reason": "b"}, {"reason": "c"}]
    main._add_short_course_notice(courses, [_cand(2800, 60), _cand(2800, 60), _cand(900, 20)], 2800)
    assert [c["reason"] for c in courses] == ["a", "b", "c"]


def test_notice_keeps_lap_description():
    """문구가 붙어도 "순환로 N바퀴" 설명은 지우지 않는다 (#259)."""
    courses = [{"reason": "a"}, {"reason": "b"}]
    cands = [_cand(2000, 43, lap_count=4, lap_cycle_m=694.0), _cand(1000, 21)]
    main._add_short_course_notice(courses, cands, 5600)
    assert "산책로가 짧아 최대 약 43분" in courses[0]["reason"]
    assert "순환로(약 694m)를 4바퀴 반복하는 코스입니다." in courses[0]["reason"]
    assert "반복하는 코스" not in courses[1]["reason"]


def test_no_notice_when_courses_are_close_to_target():
    courses = [{"reason": "a"}]
    main._add_short_course_notice(courses, [_cand(1700, 36)], 2000)  # 85%
    assert courses == [{"reason": "a"}]


def _plan(park, minutes, regenerate_nonce=0):
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    res = client.post("/api/v1/walk/plan", json={
        "target_duration_minutes": minutes, "speed_kmh": 2.8,
        "origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": park,
        "regenerate_nonce": regenerate_nonce,
    })
    assert res.status_code == 200, res.text
    return res.json()


def test_songgang_120_minutes_shows_notice():
    reasons = [c["reason"] for c in _plan("songgang", 120)["courses"]]
    assert all("산책로가 짧아" in r for r in reasons)


def test_songgang_20_minutes_has_no_notice():
    reasons = [c["reason"] for c in _plan("songgang", 20)["courses"]]
    assert not any("산책로가 짧아" in r for r in reasons)


def test_regenerated_plan_has_no_notice_while_first_course_reaches_target():
    for nonce in range(1, 5):
        courses = _plan("doan", 60, nonce)["courses"]
        if courses[0]["estimatedMinutes"] >= 48:
            assert not any("산책로가 짧아" in c["reason"] for c in courses)
