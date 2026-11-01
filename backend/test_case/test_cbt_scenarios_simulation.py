"""[조현정 - PM/AI Lead] 5인 CBT 필드 테스트 4대 거점 사전 E2E 시뮬레이션 테스트 모듈.

검증 대상:
- CBT-01: 대전 유림공원 (말티즈 토리, 관절 2단계, 무계단 완만길)
- CBT-02: 대전 송강근린공원 (골든 리트리버 맥스, 대형견 40분 2km+)
- CBT-03: 대전 도안호수공원 (푸들 초코, 주차장 P&R 모드 opr_doan_a)
- CBT-04: 세종호수공원 (시바견 보리, 외곽 제2주차장 pkg_sejong_02 진입로 왕복)
- CBT-05: 대전 도안호수공원 (포메라니안 콩이, 노령견 20분 단기)
"""

import pytest
from fastapi.testclient import TestClient
from main import app, _PILOT_PARKING_LOTS
from agent.pilot_park_routes import PILOT_PARK_CENTERS

client = TestClient(app)


def test_cbt_scenario_01_yurim_senior_maltese():
    """CBT-01: 대전 유림공원 토리 (말티즈 4세, 관절 2단계, 계단 0회 검증)."""
    lat, lon, _ = PILOT_PARK_CENTERS["yurim"]
    payload = {
        "dog_name": "토리",
        "breed": "말티즈",
        "weight_kg": 3.8,
        "age_years": 4,
        "joint_care_level": 2,
        "origin_lat": lat,
        "origin_lon": lon,
        "origin_mode": "park",
        "pilot_park_id": "yurim",
        "target_duration_minutes": 30,
        "weather_context": {"current": {"air_temp_celsius": 22.0, "estimated_surface_temp": 24.0}},
    }
    res = client.post("/api/v1/walk/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    best = data["courses"][0]
    assert best["stairsCount"] == "확인된 계단 0회"
    assert best["maxSlopePercent"] <= 5.0
    assert best["dataReliability"] in ("measured", "estimated")
    assert "유림공원" in best["name"] or "유림공원" in data["briefing"]


def test_cbt_scenario_02_songgang_large_retriever():
    """CBT-02: 대전 송강근린공원 맥스 (골든 리트리버 3세, 40분 2,000m+ 장거리 순환)."""
    lat, lon, _ = PILOT_PARK_CENTERS["songgang"]
    payload = {
        "dog_name": "맥스",
        "breed": "골든 리트리버",
        "weight_kg": 31.0,
        "age_years": 3,
        "joint_care_level": 0,
        "speed_kmh": 4.2,
        "origin_lat": lat,
        "origin_lon": lon,
        "origin_mode": "park",
        "pilot_park_id": "songgang",
        "target_duration_minutes": 40,
        "weather_context": {"current": {"air_temp_celsius": 20.0, "estimated_surface_temp": 21.0}},
    }
    res = client.post("/api/v1/walk/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["courses"]) >= 1
    coords = [p for f in data["geojson"]["features"] for p in f["geometry"]["coordinates"]]
    assert len(coords) >= 10


def test_cbt_scenario_03_doan_parking_pnr():
    """CBT-03: 대전 도안호수공원 초코 (푸들 5세, 주차장 P&R opr_doan_a 출발)."""
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == "opr_doan_a")
    payload = {
        "dog_name": "초코",
        "breed": "푸들",
        "weight_kg": 5.2,
        "age_years": 5,
        "origin_lat": lot["entrance_lat"],
        "origin_lon": lot["entrance_lon"],
        "origin_mode": "parking_pnr",
        "parking_lot_id": "opr_doan_a",
        "target_duration_minutes": 30,
        "weather_context": {"current": {"air_temp_celsius": 21.0, "estimated_surface_temp": 23.0}},
    }
    res = client.post("/api/v1/walk/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["parking_lot"]["parking_id"] == "opr_doan_a"
    assert data["parking_lot"]["park_zone"] == "도안호수공원"


def test_cbt_scenario_04_sejong_entry_approach_pnr():
    """CBT-04: 세종호수공원 보리 (시바견 2세, 외곽 제2주차장 진입로 550m 왕복)."""
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == "pkg_sejong_02")
    payload = {
        "dog_name": "보리",
        "breed": "시바견",
        "weight_kg": 9.5,
        "age_years": 2,
        "origin_lat": lot["entrance_lat"],
        "origin_lon": lot["entrance_lon"],
        "origin_mode": "parking_pnr",
        "parking_lot_id": "pkg_sejong_02",
        "target_duration_minutes": 30,
        "weather_context": {"current": {"air_temp_celsius": 20.0, "estimated_surface_temp": 22.0}},
    }
    res = client.post("/api/v1/walk/plan", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["score"] >= 80.0
    assert "진입로" in data["briefing"] or "보행로를 왕복하는 시간" in data["briefing"]


def test_cbt_scenario_05_doan_senior_pomeranian():
    """CBT-05: 대전 도안호수공원 콩이 (포메라니안 9세, 노령견 20분 완만길 및 웰니스 브리핑)."""
    lat, lon, _ = PILOT_PARK_CENTERS["doan"]
    payload = {
        "dog_name": "콩이",
        "breed": "포메라니안",
        "weight_kg": 3.2,
        "age_years": 9,
        "joint_care_level": 3,
        "origin_lat": lat,
        "origin_lon": lon,
        "origin_mode": "park",
        "pilot_park_id": "doan",
        "target_duration_minutes": 20,
        "weather_context": {"current": {"air_temp_celsius": 22.0, "estimated_surface_temp": 24.0}},
    }
    res = client.post("/api/v1/walk/plan", json=payload)
    data = res.json()
    briefing = data["briefing"]
    assert "도안" in briefing or "갑천" in briefing
    assert len(data["courses"]) >= 1
    for forbidden in ["슬개골", "탈구", "심장마비", "질환", "환견"]:
        assert forbidden not in briefing
