"""[US-B1, US-B2] 경로 실측 지표(services/route_profile.py)와 /walk/plan 의 course_profiles 검증."""

import pytest
from fastapi.testclient import TestClient

import main
from agent.park_route_validation import build_park_graph
from agent.pilot_park_routes import PILOT_PARK_CENTERS
from agent.surface_slope_evaluator import evaluate_route_metrics
from services import dem
from services.route_profile import measure_route_profile

client = TestClient(main.app)


def _park_body(park, minutes=30):
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    return {"origin_lat": lat, "origin_lon": lon, "target_duration_minutes": minutes,
            "origin_mode": "park", "pilot_park_id": park}


def _flatten(route):
    coords = []
    for feature in route["features"]:
        points = feature["geometry"]["coordinates"]
        coords.extend(points[1:] if coords and coords[-1] == points[0] else points)
    return coords


def test_short_route_returns_empty_profile():
    profile = measure_route_profile([[127.35, 36.36]], "yurim")
    assert profile["distance_m"] == 0.0 and profile["surface_breakdown"] is None


def test_slope_uses_the_same_method_as_the_route_metrics():
    coords = [list(n) for n in list(build_park_graph("yurim").nodes)[:40]]
    profile = measure_route_profile(coords)
    assert profile["max_slope_percent"] == evaluate_route_metrics(coords)["max_slope_percent"]
    assert profile["slope_source"] == "approximation" and profile["elevation_source"] is None  # 테스트는 DEM 끔


def test_outside_parks_surface_and_stairs_are_unknown_not_guessed():
    profile = measure_route_profile([[127.3780, 36.3510], [127.3790, 36.3515], [127.3800, 36.3510]])
    assert profile["basis"] == "no_osm_tags"
    assert profile["surface_breakdown"] is None and profile["soft_surface_ratio"] is None
    assert profile["stairs_count"] is None and profile["shade_ratio"] is None


@pytest.mark.parametrize("park", ["yurim", "songgang", "sejong", "doan"])
def test_park_routes_get_surface_ratios_from_park_network_tags(park):
    data = client.post("/api/v1/walk/plan", json=_park_body(park)).json()
    assert set(data["course_profiles"]) == {course["id"] for course in data["courses"]}
    for course_id, profile in data["course_profiles"].items():
        assert profile["basis"] == f"park_network:{park}"
        assert sum(profile["surface_breakdown"].values()) == pytest.approx(1.0, abs=0.01)
        assert 0.0 <= profile["soft_surface_ratio"] <= profile["surface_known_ratio"] <= 1.0
        assert profile["stairs_count"] == 0  # 공원 보행망은 계단(highway=steps)을 받지 않는다
        coords = _flatten(data["course_plans"][course_id]["route"])
        assert profile["distance_m"] == pytest.approx(measure_route_profile(coords, park)["distance_m"], abs=1.0)


def test_songgang_paths_have_no_surface_tags_so_surface_is_unknown():
    """송강 보행망 way 22개는 surface 태그가 없다 (P0 품질표): 폭신한 노면 비율을 지어내지 않는다."""
    profile = next(iter(client.post("/api/v1/walk/plan", json=_park_body("songgang")).json()["course_profiles"].values()))
    assert profile["surface_breakdown"] == {"unknown": 1.0}
    assert profile["surface_known_ratio"] == 0.0 and profile["soft_surface_ratio"] == 0.0


def test_dem_on_marks_the_slope_source(monkeypatch):
    monkeypatch.delenv(dem.ENV_DEM_DIR)  # 운영처럼 DEM_DIR 없음 → Copernicus
    try:
        profile = next(iter(client.post("/api/v1/walk/plan", json=_park_body("yurim")).json()["course_profiles"].values()))
        assert profile["slope_source"] == "dem" and profile["elevation_source"] == "Copernicus DEM GLO-30"
    finally:
        dem.reset_default_dem()  # 연 DEM 파일을 닫아 다음 테스트·종료에 남기지 않는다
