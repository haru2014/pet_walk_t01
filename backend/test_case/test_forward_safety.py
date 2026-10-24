from services import forward_safety as safety


def _north_route(lat=36.36, lon=127.36):
    # 약 250m 북쪽으로 이어지는 단순화된 보행 경로
    return [[lon, lat], [lon, lat + 0.0005], [lon, lat + 0.0010], [lon, lat + 0.00225]]


def test_analyzes_dem_grade_and_osm_stairs(monkeypatch):
    coords = _north_route()
    monkeypatch.setattr(safety, "fetch_osrm_foot_route", lambda *args, **kwargs: (coords, 250, 300))
    monkeypatch.setattr(safety, "get_elevation_m", lambda lat, lon: 100 + (lat - coords[0][1]) * 20000)
    monkeypatch.setattr(safety, "count_route_steps", lambda route: 1)

    result = safety.analyze_forward_safety(36.36, 127.36, 0)

    assert result["route_status"] == "available"
    assert result["slope"]["status"] == "warning"
    assert result["slope"]["direction"] == "오르막"
    assert result["stairs"] == {"status": "warning", "count": 1, "source": safety.STEPS_SOURCE}


def test_missing_dem_and_osm_coverage_are_explicitly_unknown(monkeypatch):
    coords = _north_route()
    monkeypatch.setattr(safety, "fetch_osrm_foot_route", lambda *args, **kwargs: (coords, 250, 300))
    monkeypatch.setattr(safety, "get_elevation_m", lambda lat, lon: None)
    monkeypatch.setattr(safety, "count_route_steps", lambda route: None)

    result = safety.analyze_forward_safety(36.36, 127.36, 0)

    assert result["slope"]["status"] == "unknown"
    assert result["stairs"]["status"] == "unknown"


def test_rejects_route_snapped_far_from_current_location(monkeypatch):
    coords = _north_route(lat=36.37)
    monkeypatch.setattr(safety, "fetch_osrm_foot_route", lambda *args, **kwargs: (coords, 250, 300))

    result = safety.analyze_forward_safety(36.36, 127.36, 0)

    assert result["route_status"] == "unknown"
    assert result["slope"]["status"] == "unknown"
    assert result["stairs"]["status"] == "unknown"


