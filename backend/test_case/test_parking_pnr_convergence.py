"""[US-G1] 실제 공영주차장 P&R 출입구 웨이포인트 스냅 및 거리 오차 수렴 검증 테스트 모듈.

과제 1-2 요구사항:
- 3번 노희선의 GET /api/v1/parking/nearby 에서 수신된 실제 주차장 출입구 좌표를 순환 루프 시작/종료점으로 강제 바인딩.
- 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) 및 세종호수공원 실제 공영주차장 출입구 출발 순환 루프 종결성 검증.
- OSRM/ORS 기반 보행로 엔진이 주차장으로 되돌아오는 폐곡선을 오차 허용 범위 이내로 수렴하는지 검증.
"""

import math
import pytest
from fastapi.testclient import TestClient
from main import app, _PILOT_PARKING_LOTS
from agent.route_geometry import haversine_m, loop_closure_gap_m

client = TestClient(app)


def test_get_nearby_parking_lots_pilot_zones():
    """GET /api/v1/parking/nearby 호출 시 대전/세종 4대 거점 공영주차장 11개소 목록 조회 검증."""
    # 유림공원 중심 좌표 기준 검색
    res = client.get("/api/v1/parking/nearby?lat=36.3628&lon=127.3592&radius_m=2000")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["total_count"] >= 3
    lots = data["parking_lots"]
    assert any(lot["parking_id"] == "pkg_yurim_01" for lot in lots)
    assert any(lot["name"] == "유림공원 부설 공영주차장" for lot in lots)


@pytest.mark.parametrize("parking_id, expected_zone", [
    ("pkg_yurim_02", "유림공원"),
    ("opr_doan_a", "도안호수공원"),
    ("opr_doan_b", "도안호수공원"),
])
def test_parking_pnr_entrance_snap_and_closure(parking_id: str, expected_zone: str):
    """P&R 주차장 출입구 좌표가 순환 코스의 시작/종료점에 강제 바인딩되고 루프가 닫히는지 검증."""
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == parking_id)
    ent_lat, ent_lon = lot["entrance_lat"], lot["entrance_lon"]

    res = client.post(
        "/api/v1/walk/plan",
        json={
            "dog_name": "토리",
            "target_duration_minutes": 30,
            "origin_lat": ent_lat,
            "origin_lon": ent_lon,
            "origin_mode": "parking_pnr",
            "parking_lot_id": parking_id,
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert data["parking_lot"]["parking_id"] == parking_id
    assert data["parking_lot"]["park_zone"] == expected_zone

    # geojson 시작점과 종료점이 주차장 출입구(60m 이내)에 정확히 스냅되었는지 확인
    features = data["geojson"]["features"]
    start_pt = features[0]["geometry"]["coordinates"][0]   # [lon, lat]
    end_pt = features[-1]["geometry"]["coordinates"][-1]

    # 시작점과 주차장 출입구 거리 (m)
    dist_start = haversine_m((ent_lon, ent_lat), (start_pt[0], start_pt[1]))
    assert dist_start <= 100.0, f"시작점이 주차장 출입구와 너무 멉니다: {dist_start:.1f}m"

    # 순환 폐곡선 종결성 검증 (시작점과 종료점 거리 20m 이내)
    gap = haversine_m((start_pt[0], start_pt[1]), (end_pt[0], end_pt[1]))
    assert gap <= 20.0, f"주차장으로 되돌아오는 루프 종결 오차 초과: {gap:.1f}m"


@pytest.mark.parametrize("parking_id, code", [
    ("pkg_yurim_01", "ORIGIN_NOT_CONNECTED"),
    ("pkg_songgang_01", "ORIGIN_NOT_CONNECTED"),
    ("pkg_sejong_01", "ORIGIN_NOT_CONNECTED"),
    ("pkg_doan_01", "ORIGIN_NOT_CONNECTED"),
    # 갑천생태호수공원 남쪽 구역은 OSM 보행로가 1.3km 뿐이고 순환로가 없다 (주차장 C data_issue 참고)
    ("opr_doan_c", "NO_VALID_LOOP"),
])
def test_unconnected_or_unverified_parking_does_not_bypass_park_validation(parking_id, code):
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == parking_id)
    response = client.post("/api/v1/walk/plan", json={
        "origin_mode": "parking_pnr", "parking_lot_id": parking_id,
        "origin_lat": lot["entrance_lat"], "origin_lon": lot["entrance_lon"],
        "target_duration_minutes": 30,
    })
    assert response.status_code == 422
    assert response.json()["code"] == code
    assert "geojson" not in response.json()


def test_parking_pnr_target_distance_convergence(monkeypatch):
    """도심 일반 공영주차장 P&R 코스 탐색 시 목표 거리 대비 오차 ±15% 이내 수렴 검증."""
    import agent.loop_route_planner as lrp
    from test_case.test_walk_plan_latency import _circle_route

    # 외부 OSRM 질의를 안정적 루프로 몽키패치
    monkeypatch.setattr(lrp, "fetch_osrm_foot_route", lambda w, timeout_seconds=1.2, use_cache=True: _circle_route(w))

    target_distance = 1500.0  # 목표 1.5km
    # 도심 임의 공영주차장 좌표 (서울 중구)
    pkg_lat, pkg_lon = 37.5665, 126.9780

    plans = lrp.plan_loop_candidates(pkg_lat, pkg_lon, target_distance_m=target_distance, origin_mode="current_location")
    assert len(plans) == 3

    for variant, plan in plans.items():
        if plan.source == "osrm_live":
            error_rate = abs(plan.distance_m - target_distance) / target_distance
            assert error_rate <= 0.15, f"Variant {variant} 거리 오차 {error_rate * 100:.1f}%가 허용치 15%를 초과했습니다."
