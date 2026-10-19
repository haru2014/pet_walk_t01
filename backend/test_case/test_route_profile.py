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


@pytest.mark.skipif(dem.rasterio is None, reason="rasterio 미설치: DEM 을 읽을 수 없다")
def test_dem_on_marks_the_slope_source(monkeypatch):
    monkeypatch.delenv(dem.ENV_DEM_DIR)  # 운영처럼 DEM_DIR 없음 → Copernicus
    try:
        profile = next(iter(client.post("/api/v1/walk/plan", json=_park_body("yurim")).json()["course_profiles"].values()))
        assert profile["slope_source"] == "dem" and profile["elevation_source"] == "Copernicus DEM GLO-30"
    finally:
        dem.reset_default_dem()  # 연 DEM 파일을 닫아 다음 테스트·종료에 남기지 않는다


@pytest.mark.parametrize("park", ["yurim", "songgang"])
def test_course_cards_show_measured_values_not_fixed_profiles(park):
    """#114: 카드의 경사·폭신 노면·계단은 course_profiles 실측값이다. 그늘은 자료가 없어 아직 바꾸지 않는다."""
    data = client.post("/api/v1/walk/plan", json=_park_body(park)).json()
    for course in data["courses"]:
        profile = data["course_profiles"][course["id"]]
        assert course["maxSlopePercent"] == profile["max_slope_percent"]
        assert course["stairsCount"] == f"{profile['stairs_count']}회"
        assert f"실측 최대 경사 {profile['max_slope_percent']}%" in course["reason"]
        if profile["surface_known_ratio"] >= 0.5:
            assert course["softSurfacePercent"] == round(profile["soft_surface_ratio"] * 100)
        else:
            assert course["softSurfacePercent"] is None and course["softRatio"] == "정보 없음"


def test_songgang_card_does_not_invent_soft_surface():
    data = client.post("/api/v1/walk/plan", json=_park_body("songgang")).json()
    assert all(c["softSurfacePercent"] is None and c["softRatio"] == "정보 없음" for c in data["courses"])


from services import landcover as _landcover  # noqa: E402

_needs_rasterio = pytest.mark.skipif(_landcover.rasterio is None,
                                     reason="rasterio 미설치: 토지피복을 읽을 수 없어 그늘 값이 '알 수 없음'이 된다")


class TestShadeStage1:
    """그늘 1단계: 위성 토지피복(ESA WorldCover 2021)으로 '나무 덮개 10m 안' 길이 비율."""

    @_needs_rasterio
    @pytest.mark.parametrize("park", ["yurim", "songgang", "sejong"])
    def test_supported_parks_get_a_shade_ratio_with_source(self, park):
        profiles = client.post("/api/v1/walk/plan", json=_park_body(park, 40)).json()["course_profiles"]
        for profile in profiles.values():
            assert 0.0 <= profile["shade_ratio"] <= 1.0
            assert profile["shade_source"] == "ESA WorldCover 2021 (10m, CC BY 4.0)"

    @_needs_rasterio
    def test_wooded_park_is_shadier_than_the_open_lake_park(self):
        def mean_shade(park):
            values = [p["shade_ratio"] for p in
                      client.post("/api/v1/walk/plan", json=_park_body(park, 40)).json()["course_profiles"].values()]
            return sum(values) / len(values)
        assert mean_shade("yurim") > mean_shade("sejong") + 0.2

    def test_doan_is_unknown_because_the_data_predates_the_park(self):
        for profile in client.post("/api/v1/walk/plan", json=_park_body("doan")).json()["course_profiles"].values():
            assert profile["shade_ratio"] is None and profile["shade_source"] is None

    def test_routes_outside_parks_are_unknown(self):
        profile = measure_route_profile([[127.3780, 36.3510], [127.3790, 36.3515], [127.3800, 36.3510]])
        assert profile["shade_ratio"] is None and profile["shade_source"] is None

    def test_missing_data_or_out_of_coverage_is_unknown_not_an_error(self, monkeypatch, tmp_path):
        from services import landcover
        assert landcover.near_tree_ratio([[126.9780, 37.5665], [126.9790, 37.5670]]) is None  # 서울: 자료 범위 밖
        monkeypatch.setattr(landcover, "LANDCOVER_PATH", tmp_path / "missing.tif")
        landcover.reset_landcover_cache()
        try:
            coords = [list(n) for n in list(build_park_graph("yurim").nodes)[:20]]
            assert landcover.near_tree_ratio(coords) is None
        finally:
            landcover.reset_landcover_cache()

    def test_notice_carries_the_required_attribution(self):
        from services import landcover
        notice = (landcover.LANDCOVER_PATH.parent / "NOTICE.md").read_text(encoding="utf-8")
        assert landcover.LANDCOVER_ATTRIBUTION in notice and "CC BY 4.0" in notice
