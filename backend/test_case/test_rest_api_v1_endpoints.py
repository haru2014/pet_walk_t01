"""[3번 노희선 - 서버] FastAPI v1 REST 엔드포인트 통합(HTTP 계약) 테스트 모듈.

test_api_contracts.py 가 DTO(데이터 모양)를 검증한다면, 이 모듈은 실제 FastAPI 앱을
TestClient 로 띄워 HTTP 요청/응답까지 검증합니다.

대상 엔드포인트 (US-D2 서버 우회, US-D1 비전 입구, hazard_reports 적재):
- POST /api/v1/walk/reroute     : 현장 위험 감지 시 안전 우회 재탐색 (3초 이내)
- POST /api/v1/surface/inspect  : 현장 위험물/공원안내판 사진 판독 입구 (비전 체인 미연결 시 mock 모드)
- POST /api/v1/hazards          : 공공 위험 제보 적재 (Supabase hazard_reports / 인메모리 폴백)
- GET  /api/v1/hazards          : 반경 내 위험 제보 조회
"""

import io

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


# 서울시청 인근 좌표 (lat, lon)
_CUR = (37.5665, 126.9780)
_DEST = (37.5700, 126.9820)
_HAZARD = (37.5680, 126.9800)


def _reroute_payload(**overrides):
    payload = {
        "current_lat": _CUR[0],
        "current_lon": _CUR[1],
        "destination_lat": _DEST[0],
        "destination_lon": _DEST[1],
        "hazard_lat": _HAZARD[0],
        "hazard_lon": _HAZARD[1],
        "hazard_type": "high_curb",
        "severity": "warning",
        "confidence": 0.92,
    }
    payload.update(overrides)
    return payload


class TestWalkRerouteEndpoint:
    """[US-D2] POST /api/v1/walk/reroute"""

    def test_hazard_triggers_reroute_with_geojson_and_voice(self, client):
        res = client.post("/api/v1/walk/reroute", json=_reroute_payload())
        assert res.status_code == 200, res.text
        body = res.json()

        assert body["status"] == "REROUTED"
        assert body["needs_reroute"] is True
        assert body["penalty_multiplier"] == 10.0
        assert "우회" in body["voice_alert"]
        assert body["latency_seconds"] < 3.0

        geo = body["geojson"]
        assert geo["type"] == "FeatureCollection"
        coords = geo["features"][0]["geometry"]["coordinates"]
        assert len(coords) >= 3
        # 좌표는 [lon, lat] 순서, 시작점은 현재 위치
        assert coords[0] == pytest.approx([_CUR[1], _CUR[0]])
        assert coords[-1] == pytest.approx([_DEST[1], _DEST[0]])

    def test_rerouted_path_keeps_clearance_from_hazard(self, client):
        res = client.post("/api/v1/walk/reroute", json=_reroute_payload())
        body = res.json()
        assert body["hazard_clearance_m"] >= 50.0

    def test_low_confidence_keeps_current_route(self, client):
        res = client.post("/api/v1/walk/reroute", json=_reroute_payload(confidence=0.4))
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "KEEP_ROUTE"
        assert body["needs_reroute"] is False
        assert body["penalty_multiplier"] == 1.0

    def test_info_severity_does_not_reroute(self, client):
        res = client.post("/api/v1/walk/reroute", json=_reroute_payload(severity="info"))
        assert res.json()["status"] == "KEEP_ROUTE"

    def test_route_deviation_reroutes_from_current_position(self, client):
        payload = {
            "current_lat": 36.3745,
            "current_lon": 127.3825,
            "destination_lat": _DEST[0],
            "destination_lon": _DEST[1],
            "reroute_reason": "deviation",
            "route_coordinates": [[_CUR[1], _CUR[0]], [_DEST[1], _DEST[0]]],
        }
        res = client.post("/api/v1/walk/reroute", json=payload)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["status"] == "REROUTED"
        assert body["needs_reroute"] is True
        assert "재탐색" in body["voice_alert"]
        coords = body["geojson"]["features"][0]["geometry"]["coordinates"]
        assert coords[0] == pytest.approx([127.3825, 36.3745])
        assert coords[-1] == pytest.approx([_DEST[1], _DEST[0]])

    def test_invalid_hazard_type_rejected(self, client):
        res = client.post("/api/v1/walk/reroute", json=_reroute_payload(hazard_type="lava"))
        assert res.status_code == 422


class TestSurfaceInspectEndpoint:
    """[US-D1 입구] POST /api/v1/surface/inspect (multipart 이미지 업로드)"""

    @staticmethod
    def _fake_image(name: str = "scene.jpg") -> dict:
        return {"image": (name, io.BytesIO(b"\xff\xd8\xff\xe0fakejpegbytes"), "image/jpeg")}

    def test_hazard_inspection_returns_structured_schema(self, client):
        res = client.post(
            "/api/v1/surface/inspect",
            data={"inspect_type": "hazard"},
            files=self._fake_image("stairs_front.jpg"),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["inspect_type"] == "hazard"
        assert body["is_live_vision"] in (True, False)
        result = body["result"]
        assert result["hazard_type"] in ["high_curb", "stairs", "construction", "broken_glass", "none"]
        assert result["severity"] in ["info", "warning", "danger"]
        assert result["recommended_action"] in ["reroute", "proceed_with_caution", "safe"]
        assert 0.0 <= result["confidence"] <= 1.0
        assert "needs_reroute" in body["routing_action"]

    def test_park_board_inspection_returns_constraints(self, client):
        res = client.post(
            "/api/v1/surface/inspect",
            data={"inspect_type": "park_board"},
            files=self._fake_image("park_board.jpg"),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["inspect_type"] == "park_board"
        result = body["result"]
        assert isinstance(result["park_name"], str)
        assert isinstance(result["dog_restricted_zones"], list)
        assert "blocked_zones" in body["routing_constraints"]

    def test_non_image_upload_rejected(self, client):
        res = client.post(
            "/api/v1/surface/inspect",
            data={"inspect_type": "hazard"},
            files={"image": ("notes.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert res.status_code == 415

    def test_unknown_inspect_type_rejected(self, client):
        res = client.post(
            "/api/v1/surface/inspect",
            data={"inspect_type": "weather"},
            files=self._fake_image(),
        )
        assert res.status_code == 422


class TestHazardReportEndpoints:
    """[US-D2 AC3] POST / GET /api/v1/hazards"""

    def _report(self, client, **overrides):
        payload = {
            "user_id": "tester_01",
            "lat": _HAZARD[0],
            "lon": _HAZARD[1],
            "hazard_type": "stairs",
            "severity": "danger",
            "description": "공원 북문 앞 야외 계단 12단, 노령견 통행 어려움",
        }
        payload.update(overrides)
        return client.post("/api/v1/hazards", json=payload)

    def test_create_hazard_report(self, client):
        res = self._report(client)
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["status"] == "reported"
        report = body["report"]
        assert report["report_id"].startswith("hz_")
        assert report["hazard_type"] == "stairs"
        assert report["severity"] == "danger"
        assert report["created_at"]
        assert body["is_supabase"] in (True, False)

    def test_short_description_rejected(self, client):
        res = self._report(client, description="짧음")
        assert res.status_code == 422

    def test_out_of_range_coordinate_rejected(self, client):
        res = self._report(client, lat=123.0)
        assert res.status_code == 422

    def test_list_nearby_hazards_within_radius(self, client):
        self._report(client, description="반경 테스트용 높은 턱 제보", hazard_type="high_curb", severity="warning")
        res = client.get(
            "/api/v1/hazards",
            params={"lat": _HAZARD[0], "lon": _HAZARD[1], "radius_m": 300},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["count"] >= 1
        for r in body["reports"]:
            assert r["distance_m"] <= 300

    def test_far_query_returns_empty(self, client):
        # 부산 좌표에서 조회하면 서울 제보는 걸리지 않아야 함
        res = client.get("/api/v1/hazards", params={"lat": 35.1796, "lon": 129.0756, "radius_m": 500})
        assert res.status_code == 200
        assert res.json()["count"] == 0


class TestWeatherHeatRiskEndpoint:
    """[US-F1] GET /api/v1/weather/heat-risk 시간대별 지면열 및 골든타임 조회 검증."""

    def test_get_weather_heat_risk_returns_200_and_valid_schema(self, client):
        res = client.get("/api/v1/weather/heat-risk", params={"lat": 37.544, "lon": 127.038})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert "current" in data
        assert "hourly_forecast" in data
        assert len(data["hourly_forecast"]) == 24
        assert "golden_time_window" in data
        assert "기상청 예보 모델 기반 추정치" in data["notice"]

        current = data["current"]
        assert "air_temp_celsius" in current
        assert "estimated_surface_temp" in current
        assert current["risk_level"] in ("SAFE", "CAUTION", "DANGER")
        assert isinstance(current["is_golden_time"], bool)


class TestParkingNearbyEndpoint:
    """[US-G1] GET /api/v1/parking/nearby 대전 3대 공원 & 세종호수공원 공영주차장 검색 검증."""

    def test_yurim_park_nearby_parking_lots(self, client):
        # 대전 유림공원 중심
        res = client.get("/api/v1/parking/nearby", params={"lat": 36.3622, "lon": 127.3585, "radius_m": 1500})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["total_count"] >= 3
        first_lot = data["parking_lots"][0]
        assert "유림공원" in first_lot["name"]
        assert first_lot["distance_m"] <= 1500.0
        assert first_lot["entrance_lat"] > 36.0
        assert first_lot["entrance_lon"] > 127.0
        assert first_lot["fee_type"] in ("free", "paid")

    def test_sejong_lake_park_nearby_parking_lots(self, client):
        # 세종호수공원 중심
        res = client.get("/api/v1/parking/nearby", params={"lat": 36.5042, "lon": 127.2680, "radius_m": 1500})
        assert res.status_code == 200
        data = res.json()
        assert data["total_count"] >= 4
        assert any("세종호수공원" in lot["name"] for lot in data["parking_lots"])

    def test_far_away_location_returns_empty(self, client):
        # 서울 시청 좌표 조회 시 대전/세종 거점 주차장은 검색되지 않아야 함
        res = client.get("/api/v1/parking/nearby", params={"lat": 37.5665, "lon": 126.9780, "radius_m": 1500})
        assert res.status_code == 200
        data = res.json()
        assert data["total_count"] == 0




def test_osrm_failure_reason_is_recorded_and_reported_in_health(client, monkeypatch):
    """OSRM 실패가 조용히 버려지지 않고 이유가 /health 에 남는다 (운영에서 대체 경로로 떨어지는 원인 확인용)."""
    import urllib.error
    import urllib.request
    from agent import road_network_routes as rnr

    def _timeout(*_args, **_kwargs):
        raise urllib.error.URLError(TimeoutError("timed out"))

    monkeypatch.setattr(urllib.request, "urlopen", _timeout)
    before = rnr.osrm_status()["failure"]
    assert rnr._fetch_osrm_foot_route_uncached([(36.33, 127.43), (36.34, 127.43)], 0.1) is None
    status = client.get("/health").json()["osrm"]
    assert status["failure"] == before + 1
    assert "TimeoutError" in status["last_error"]
    assert set(status) >= {"success", "failure", "last_error", "last_error_elapsed_ms", "circuit_open"}


def test_walk_plan_reports_route_source_per_course(client):
    res = client.post("/api/v1/walk/plan", json={
        "origin_mode": "park", "pilot_park_id": "yurim",
        "origin_lat": 36.3620608, "origin_lon": 127.3601379, "target_duration_minutes": 30,
    })
    assert res.status_code == 200
    sources = res.json()["route_sources"]
    assert len(sources) == 3 and all(source == "park_graph_yurim" for source in sources.values())
