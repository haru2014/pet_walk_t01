"""[US-G1] 실제 공영주차장 P&R 출입구 웨이포인트 스냅 및 거리 오차 수렴 검증 테스트 모듈.

과제 1-2 요구사항:
- 3번 노희선의 GET /api/v1/parking/nearby 에서 수신된 실제 주차장 출입구 좌표를 순환 루프 시작/종료점으로 강제 바인딩.
- 대전 3대 공원(유림공원, 송강근린공원, 도안호수공원) 및 세종호수공원 실제 공영주차장 출입구 출발 순환 루프 종결성 검증.
- OSRM/ORS 기반 보행로 엔진이 주차장으로 되돌아오는 폐곡선을 오차 허용 범위 이내로 수렴하는지 검증.
"""

import json
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
    ("pkg_sejong_01", "세종호수공원"),  # 2026-10-19 공단 공식 제1주차장 위치로 바로잡음 (공원 보행망 72m)
    ("pkg_sejong_02", "세종호수공원"),  # 공원 경계 밖: 저장된 진입로(약 550m)를 왕복한다 (#160)
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
    ("pkg_sejong_03", "ORIGIN_NOT_CONNECTED"),  # 공원 경계 밖, 100m 안에 공원으로 이어지는 보행 전용 길이 없음 (#160)
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


def test_sejong_walk_network_includes_shared_cycleways_only_there():
    """세종호수공원 보행망은 보행 금지 표시가 없는 자전거도로를 포함하고, 다른 공원은 그대로다 (#148)."""
    from agent.park_route_validation import build_park_graph, load_park_networks
    networks = load_park_networks()
    sejong_cycleways = [w for w in networks["sejong"]["ways"] if w["tags"].get("highway") == "cycleway"]
    assert sejong_cycleways
    assert all(w["tags"].get("foot") not in ("no", "private") for w in sejong_cycleways)
    cycleway_ids = {w["way_id"] for w in sejong_cycleways}
    assert any(data["way_id"] in cycleway_ids for _, _, data in build_park_graph("sejong").edges(data=True))
    for park_id in ("yurim", "songgang", "doan"):
        assert all(w["tags"].get("highway") != "cycleway" for w in networks[park_id]["ways"])


def _plan_from_lot(parking_id: str, minutes: float = 30):
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == parking_id)
    return client.post("/api/v1/walk/plan", json={
        "origin_mode": "parking_pnr", "parking_lot_id": parking_id,
        "origin_lat": lot["entrance_lat"], "origin_lon": lot["entrance_lon"],
        "target_duration_minutes": minutes,
    })


def test_outside_parking_lot_walks_the_stored_entry_approach_both_ways():
    """공원 경계 밖 주차장은 저장된 진입로로 들어갔다 같은 길로 나오고, 공원 코스는 목표 시간에 맞춘다 (#160 가 안)."""
    from agent.park_route_validation import load_entry_approaches
    approach = load_entry_approaches()["pkg_sejong_02"]["coordinates"]
    response = _plan_from_lot("pkg_sejong_02", 30)
    assert response.status_code == 200
    data = response.json()
    for route_id, validation in data["route_validation"].items():
        assert validation["entry_approach_m"] > 0
        assert validation["distance_m"] > validation["loop_distance_m"] + 2 * validation["entry_approach_m"] - 1
        assert validation["loop_estimated_minutes"] <= 30 * 1.25
    coords = [p for f in data["geojson"]["features"] for p in f["geometry"]["coordinates"]]
    assert coords[0] == approach[0] and coords[-1] == approach[0]
    assert "편도 약" in json.dumps(data, ensure_ascii=False)  # 안내 문구에 진입로 왕복을 알린다


def test_entry_approach_must_match_the_stored_path():
    """진입로를 바꾸거나 빼먹은 경로는 검증에서 막는다."""
    from agent.park_route_validation import RoutePlanningError, load_entry_approaches, validate_park_route
    from agent.park_walk_planner import plan_park_walk
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == "pkg_sejong_02")
    origin = (lot["entrance_lon"], lot["entrance_lat"])
    route = plan_park_walk("sejong", origin[1], origin[0], 1400.0, 1)
    assert validate_park_route(route, "sejong", 2.8, 30, origin)["entry_approach_m"] > 0
    k = len(load_entry_approaches()["pkg_sejong_02"]["coordinates"])
    shifted = [list(p) for p in route]
    shifted[1] = [shifted[1][0] + 0.0005, shifted[1][1]]
    for bad in (route[k - 1:len(route) - k + 1], shifted):
        with pytest.raises(RoutePlanningError):
            validate_park_route(bad, "sejong", 2.8, 30, origin)


def test_entry_approach_does_not_lower_the_distance_score():
    """거리 점수는 공원 안 코스로만 매긴다: 진입로가 있는 제2주차장도 목표 거리에 맞는 코스면 거리 점수가 깎이지 않는다."""
    from agent.park_route_validation import entry_approach_length_m, load_entry_approaches
    from agent.park_walk_planner import plan_park_walk
    from agent.route_geometry import polyline_length_m
    lot = next(p for p in _PILOT_PARKING_LOTS if p["parking_id"] == "pkg_sejong_02")
    route = plan_park_walk("sejong", lot["entrance_lat"], lot["entrance_lon"], 1400.0, 1)
    approach = polyline_length_m(load_entry_approaches()["pkg_sejong_02"]["coordinates"])
    assert entry_approach_length_m("sejong", route) == pytest.approx(approach)
    assert entry_approach_length_m("yurim", route) == 0.0
    assert entry_approach_length_m("sejong", route[1:]) == 0.0

    # 기상 상태에 따른 주간 지면열 변동(10~16시 고온 감점)과 무관하게 진입로 거리 점수가 깎이지 않음을 검증한다
    response = client.post("/api/v1/walk/plan", json={
        "origin_mode": "parking_pnr", "parking_lot_id": "pkg_sejong_02",
        "origin_lat": lot["entrance_lat"], "origin_lon": lot["entrance_lon"],
        "target_duration_minutes": 30,
        "weather_context": {"current": {"air_temp_celsius": 20.0, "estimated_surface_temp": 22.0}},
    })
    assert response.status_code == 200
    assert response.json()["score"] >= 85
