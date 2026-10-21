"""[#183] 앱의 공원 모드(공원 중심 좌표)는 공원 한가운데가 아니라 공원 보행망에 이어지는 주차장 입구에서 출발한다.

앱은 공원 모드에서 공원 중심 좌표를 보낸다(frontend/src/types/pilotParks.ts center == PILOT_PARK_CENTERS).
앱을 고치지 않고 서버가 출발점을 주차장으로 바꿔, 데이터 담당이 모은 주차장 자료를 쓴다.
"""

import pytest
from fastapi.testclient import TestClient

import main
from agent.pilot_park_routes import PILOT_PARK_CENTERS
from agent.route_geometry import haversine_m

client = TestClient(main.app)

# 로컬 확인(10/21): 공원마다 보행망에 이어지고 좌표 경고(data_issue)가 없는 주차장
EXPECTED_LOT = {
    "yurim": "std_186-1-000005",  # 유림공원주차장
    "sejong": "pkg_sejong_01",  # 세종호수공원 제1주차장
    "songgang": "std_186-2-000002",  # 송강동(프라자옆)공영
    "doan": "opr_doan_a",  # 갑천생태호수공원 주차장A
}


def _plan(body):
    res = client.post("/api/v1/walk/plan", json={"target_duration_minutes": 40, "speed_kmh": 2.8, **body})
    assert res.status_code == 200, res.text
    return res.json()


def _first_point(data):
    plan = data["course_plans"][data["courses"][0]["id"]]
    return plan["route"]["features"][0]["geometry"]["coordinates"][0]


@pytest.mark.parametrize("park", sorted(EXPECTED_LOT))
def test_park_center_request_starts_at_parking_lot(park):
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    data = _plan({"origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": park})
    lot = data["parking_lot"]
    assert lot["parking_id"] == EXPECTED_LOT[park]
    assert not lot.get("data_issue")
    # 앱(api.ts isValidParkResponse)이 받아들이는 조건은 그대로 만족해야 한다
    assert data["validated_park_id"] == park
    assert all(v["passed"] and v["park_id"] == park for v in data["route_validation"].values())
    # 코스 출발점은 주차장 입구 근처(보행망에 붙는 거리 100m 이내)
    assert haversine_m(_first_point(data), (lot["entrance_lon"], lot["entrance_lat"])) <= 100.0


def test_request_away_from_park_center_is_unchanged():
    """공원 중심이 아닌 곳에서 출발한 공원 모드 요청은 기존처럼 그 위치에서 출발한다."""
    lat, lon, _ = PILOT_PARK_CENTERS["yurim"]
    data = _plan({"origin_lat": lat + 0.0006, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": "yurim"})
    assert "parking_lot" not in data


def test_explicit_parking_lot_is_respected():
    lot = next(l for l in main._PILOT_PARKING_LOTS if l["parking_id"] == "pkg_sejong_02")
    data = _plan({"origin_lat": lot["entrance_lat"], "origin_lon": lot["entrance_lon"], "origin_mode": "park",
                  "pilot_park_id": "sejong", "parking_lot_id": "pkg_sejong_02"})
    assert data["parking_lot"]["parking_id"] == "pkg_sejong_02"


def test_park_without_connectable_lot_keeps_center(monkeypatch):
    monkeypatch.setattr(main, "_PILOT_PARKING_LOTS", [])
    monkeypatch.setattr(main, "_DEFAULT_PARK_LOT_CACHE", {})
    lat, lon, _ = PILOT_PARK_CENTERS["yurim"]
    data = _plan({"origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": "yurim"})
    assert "parking_lot" not in data


def test_parking_start_skipped_when_courses_would_look_the_same():
    """세종 제1주차장은 막다른 길 끝이라 30분 코스 3개가 처음 수백 m 를 함께 쓴다(간선 겹침 0.65 이상).
    코스가 서로 다른 길이어야 한다는 요구(#125·#155)가 우선이라 이때는 공원 중심 출발을 유지한다."""
    lat, lon, _ = PILOT_PARK_CENTERS["sejong"]
    data = _plan({"origin_lat": lat, "origin_lon": lon, "origin_mode": "park", "pilot_park_id": "sejong",
                  "target_duration_minutes": 30})
    assert "parking_lot" not in data
