"""지도 구간별 진행 방향 경사(slopeSignedPercent)·추정 지면온도(surfaceTempC) (#158, 앱 #233).

실제로 잴 수 있는 값만 내고 모르면 None 이다. 그늘·노면도 지어내지 않는다.
"""
import pytest
from fastapi.testclient import TestClient

import main
from agent.surface_slope_evaluator import build_segmented_geojson
from services import dem

client = TestClient(main.app)
HOT_NOON = {"current": {"air_temp_celsius": 30.0, "insolation_weight": 0.9, "estimated_surface_temp": 45.0}}


def _plan(park, lat, lon, weather=HOT_NOON):
    res = client.post("/api/v1/walk/plan", json={
        "origin_mode": "park", "pilot_park_id": park, "origin_lat": lat, "origin_lon": lon,
        "target_duration_minutes": 30, "weather_context": weather})
    assert res.status_code == 200
    return res.json()


def _props(data):
    return [f["properties"] for plan in data["course_plans"].values() for f in plan["route"]["features"]]


def test_without_conditions_nothing_is_invented():
    coords = [[127.3600, 36.3620], [127.3610, 36.3625], [127.3620, 36.3630]]
    for props in (f["properties"] for f in build_segmented_geojson(coords)["features"]):
        assert props["slopeSignedPercent"] is None and props["surfaceTempC"] is None
        assert props["surface"] is None and props["shaded"] is None


def test_reversed_route_flips_the_slope_direction():
    coords = [[127.3600, 36.3620], [127.3650, 36.3650], [127.3700, 36.3680]]
    forward = build_segmented_geojson(coords, link_conditions=[{"slope_signed": 4.0}, {"slope_signed": 5.0}])
    assert forward["features"][0]["properties"]["slopeSignedPercent"] > 3
    backward = build_segmented_geojson(coords[::-1], link_conditions=[{"slope_signed": -5.0}, {"slope_signed": -4.0}])
    assert backward["features"][0]["properties"]["slopeSignedPercent"] < -3


def test_segments_split_where_the_slope_direction_or_temperature_band_changes():
    coords = [[127.360, 36.362], [127.361, 36.362], [127.362, 36.362], [127.363, 36.362]]
    conditions = [{"slope_signed": 5.0, "temp": 30.0}, {"slope_signed": -5.0, "temp": 30.0},
                  {"slope_signed": -5.0, "temp": 41.0}]
    features = build_segmented_geojson(coords, link_conditions=conditions)["features"]
    assert [round(f["properties"]["slopeSignedPercent"]) for f in features] == [5, -5, -5]
    assert [f["properties"]["surfaceTempC"] for f in features] == [30.0, 30.0, 41.0]


@pytest.fixture
def bundled_dem(monkeypatch):
    """conftest 가 DEM_DIR 을 비워 DEM 을 끄므로, 이 테스트만 저장소의 Copernicus 파일을 켠다."""
    pytest.importorskip("rasterio")
    monkeypatch.delenv(dem.ENV_DEM_DIR, raising=False)
    dem.reset_default_dem()
    yield
    dem.reset_default_dem()


def test_park_route_segments_carry_slope_direction_and_known_surface_temperature(bundled_dem):
    assert dem.elevation_source() is not None
    data = _plan("yurim", 36.3620608, 127.3601379)
    props = _props(data)
    assert all(p["slopeSignedPercent"] is not None for p in props)
    known = [p for p in props if p["surface"] is not None]
    assert known, "유림 공원 보행망에는 OSM 노면 태그가 있는 구간이 있다"
    assert all(p["surfaceTempC"] is not None for p in known)
    assert all(p["surfaceTempC"] is None for p in props if p["surface"] is None)


def test_unknown_weather_gives_no_surface_temperature():
    data = _plan("yurim", 36.3620608, 127.3601379, weather={"current": {"estimated_surface_temp": 25.0}})
    assert all(p["surfaceTempC"] is None for p in _props(data))


def test_shade_is_null_where_it_is_not_measured():
    data = _plan("doan", 36.332629, 127.3505325)  # 도안: 위성 자료가 공원 조성 전이라 그늘을 재지 않는다
    assert all(p["shaded"] is None for p in _props(data))
