"""[US-F1] 날씨 어댑터가 서버 엔드포인트에 연결되었는지 검증한다 (기상청·Open-Meteo 는 호출하지 않는다)."""

import pytest
from fastapi.testclient import TestClient

import main
from services.kma_weather_client import KmaApiError
from services import open_meteo_client
from services.open_meteo_client import OpenMeteoError

_DAEJEON = {"lat": 36.3610, "lon": 127.3577}


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(main.app)


def _live_response(lat, lon):
    return {
        "status": "success",
        "current": {"air_temp_celsius": 24.0, "estimated_surface_temp": 31.0, "risk_level": "SAFE",
                    "is_golden_time": True},
        "golden_time_window": "07:00 ~ 09:00",
        "golden_time_window_day": "tomorrow",
        "hourly_forecast": [{"hour": 7}],
        "notice": "n",
        "coordinates": {"lat": lat, "lon": lon},
        "data_source": "kma_live",
        "insolation_source": "open_meteo",
        "attribution": "Weather data by Open-Meteo.com (CC BY 4.0)",
        "grid": {"nx": 67, "ny": 100},
        "bases": {},
        "warnings": [],
    }


def test_heat_risk_endpoint_returns_the_live_adapter_response(client, monkeypatch):
    calls = []
    monkeypatch.setattr(main, "build_heat_risk_response", lambda lat, lon: calls.append((lat, lon)) or _live_response(lat, lon))
    data = client.get("/api/v1/weather/heat-risk", params=_DAEJEON).json()
    assert calls == [(_DAEJEON["lat"], _DAEJEON["lon"])]
    assert data["data_source"] == "kma_live" and data["attribution"].startswith("Weather data by Open-Meteo")
    assert data["golden_time_window"] == "07:00 ~ 09:00" and data["golden_time_window_day"] == "tomorrow"


@pytest.mark.parametrize("error", [KmaApiError("키 없음"), ValueError("격자 범위 밖"), OSError("network")])
def test_heat_risk_endpoint_falls_back_when_live_weather_fails(client, monkeypatch, error):
    def boom(lat, lon):
        raise error
    monkeypatch.setattr(main, "build_heat_risk_response", boom)
    res = client.get("/api/v1/weather/heat-risk", params=_DAEJEON)
    data = res.json()
    assert res.status_code == 200 and data["data_source"] == "fallback_estimate"
    assert len(data["hourly_forecast"]) == 24 and data["attribution"] is None
    assert any(str(error) in w for w in data["warnings"])


def test_heat_risk_without_kma_key_falls_back_instead_of_calling_the_network(client):
    data = client.get("/api/v1/weather/heat-risk", params=_DAEJEON).json()
    assert data["data_source"] == "fallback_estimate"
    assert any("KMA_SERVICE_KEY" in w for w in data["warnings"])


def test_plan_route_uses_live_weather_at_the_origin_when_request_has_none(client, monkeypatch):
    seen = {}
    monkeypatch.setattr(main, "build_heat_risk_response",
                        lambda lat, lon: seen.setdefault("origin", (lat, lon)) and _live_response(lat, lon))
    captured = {}
    real = main.run_walk_planning_agent

    def spy(*args, **kwargs):
        captured["weather_context"] = kwargs.get("weather_context")
        return real(*args, **kwargs)

    monkeypatch.setattr(main, "run_walk_planning_agent", spy)
    client.post("/api/v1/walk/plan", json={"origin_lat": _DAEJEON["lat"], "origin_lon": _DAEJEON["lon"],
                                           "target_duration_minutes": 30})
    ctx = captured.get("weather_context")
    assert ctx and ctx["data_source"] == "kma_live" and ctx["golden_time_window"] == "07:00 ~ 09:00"
    assert seen["origin"] == (_DAEJEON["lat"], _DAEJEON["lon"])


def test_plan_route_keeps_a_weather_context_sent_by_the_client(client, monkeypatch):
    monkeypatch.setattr(main, "build_heat_risk_response", lambda lat, lon: pytest.fail("호출되면 안 됨"))
    captured = {}
    real = main.run_walk_planning_agent

    def spy(*args, **kwargs):
        captured["weather_context"] = kwargs.get("weather_context")
        return real(*args, **kwargs)

    monkeypatch.setattr(main, "run_walk_planning_agent", spy)
    sent = {"current": {"estimated_surface_temp": 30.0}, "golden_time_window": "06:00 ~ 08:00"}
    client.post("/api/v1/walk/plan", json={"origin_lat": _DAEJEON["lat"], "origin_lon": _DAEJEON["lon"],
                                           "target_duration_minutes": 30, "weather_context": sent})
    assert captured["weather_context"] == sent


@pytest.mark.parametrize("error", [OpenMeteoError("Open-Meteo 연결 실패 (TimeoutError)"), TimeoutError("timed out")])
def test_fallback_survives_open_meteo_failure_outside_pytest(client, monkeypatch, error):
    """대체 응답의 Open-Meteo 보정이 실패해도 500 이 아니라 대체 응답을 준다 (운영 500 회귀 방지).

    대체 응답은 pytest 중에는 Open-Meteo 호출을 건너뛰므로, 표시를 지워 운영과 같은 경로를 탄다.
    """
    def boom(*args, **kwargs):
        raise error
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setattr(open_meteo_client, "fetch_hourly_weather_forecast", boom)
    weather = client.get("/api/v1/weather/heat-risk", params=_DAEJEON)
    assert weather.status_code == 200 and weather.json()["data_source"] == "fallback_estimate"
    plan = client.post("/api/v1/walk/plan", json={"origin_lat": 36.3510, "origin_lon": 127.3780,
                                                  "target_duration_minutes": 30})
    assert plan.status_code == 200, plan.text
