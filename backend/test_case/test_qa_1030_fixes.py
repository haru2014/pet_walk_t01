"""2026-10-30 QA 에서 찾은 문제의 회귀 테스트.

- 유리 파편 제보는 우회하지 않고 현재 경로를 유지하던 문제 (앱 화면은 3초 안에 우회한다고 안내)
- 보행 속도 상한이 없어 100km/h 가 통과하고 14초가 걸리던 문제
- 바다 한가운데(0, 0)에서도 가짜 코스를 만들던 문제
- 없는 공원 id 로 우회를 요청해도 오류 없이 직선 경로를 돌려주던 문제
- 위험 제보에 유효 기간(2026-12-31)이 없던 문제
"""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)

_PLAN = {
    "origin_lat": 36.3620608, "origin_lon": 127.3601379, "origin_mode": "park",
    "pilot_park_id": "yurim", "target_duration_minutes": 30, "dog_name": "QA",
}


def test_broken_glass_reroute_avoids_the_spot():
    res = client.post("/api/v1/walk/reroute", json={
        "current_lat": 36.36, "current_lon": 127.36, "destination_lat": 36.37, "destination_lon": 127.37,
        "hazard_lat": 36.365, "hazard_lon": 127.365, "hazard_type": "broken_glass", "severity": "danger",
        "confidence": 0.9})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["needs_reroute"] is True
    assert data["status"] == "REROUTED"
    assert "유리 파편" in data["voice_alert"]


@pytest.mark.parametrize("speed", [0, -1, 0.1, 10.5, 100, "abc"])
def test_walk_plan_rejects_unrealistic_speed(speed):
    res = client.post("/api/v1/walk/plan", json={**_PLAN, "speed_kmh": speed})
    assert res.status_code == 400, res.text
    assert "km/h" in res.json()["detail"]


@pytest.mark.parametrize("lat,lon", [(0, 0), (51.5, -0.12), (36.36, 150.0), (10.0, 127.0)])
def test_walk_plan_rejects_coordinates_outside_service_area(lat, lon):
    res = client.post("/api/v1/walk/plan", json={**_PLAN, "origin_mode": "current_location", "origin_lat": lat, "origin_lon": lon})
    assert res.status_code == 400, res.text
    assert "서비스 지역" in res.json()["detail"]


@pytest.mark.parametrize("lat,lon", [(36.3620608, 127.3601379), (37.5665, 126.978), (33.4996, 126.5312), (37.2417, 131.8686)])
def test_service_area_accepts_korean_coordinates(lat, lon):
    assert main._parse_origin_coords({"origin_lat": lat, "origin_lon": lon}) == (lat, lon)


def test_reroute_rejects_unknown_park_id():
    res = client.post("/api/v1/walk/reroute", json={
        "current_lat": 36.36, "current_lon": 127.36, "destination_lat": 36.37, "destination_lon": 127.37,
        "reroute_reason": "deviation", "origin_mode": "park", "pilot_park_id": "nowhere"})
    assert res.status_code == 422, res.text


def test_reroute_accepts_known_park_id():
    res = client.post("/api/v1/walk/reroute", json={
        "current_lat": 36.3617, "current_lon": 127.3582, "destination_lat": 36.3601635, "destination_lon": 127.3553702,
        "reroute_reason": "deviation", "origin_mode": "park", "pilot_park_id": "yurim"})
    assert res.status_code == 200, res.text


def test_hazard_reports_expire_after_valid_until(monkeypatch):
    from agent import hazard_service

    saved = client.post("/api/v1/hazards", json={
        "user_id": "qa-expiry-test", "lat": 0.0, "lon": 0.0, "hazard_type": "high_curb",
        "severity": "info", "description": "유효 기간 테스트 제보입니다"}).json()["report"]
    assert saved["expires_at"].startswith("2027-01-01T00:00:00") and saved["expires_at"].endswith("+09:00")
    assert hazard_service.HAZARD_VALID_UNTIL == datetime(2027, 1, 1, tzinfo=timezone(timedelta(hours=9)))

    near = client.get("/api/v1/hazards", params={"lat": 0.0, "lon": 0.0, "radius_m": 500}).json()
    assert any(r["report_id"] == saved["report_id"] and r["expires_at"] for r in near["reports"])

    monkeypatch.setattr(hazard_service, "HAZARD_VALID_UNTIL", datetime.now(timezone.utc) - timedelta(seconds=1))
    expired = client.get("/api/v1/hazards", params={"lat": 0.0, "lon": 0.0, "radius_m": 500}).json()
    assert expired["count"] == 0
