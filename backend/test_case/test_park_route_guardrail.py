"""Regression: validate every advertised park route, not just the selected one."""
import copy
import networkx as nx
import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon, MultiPolygon, LineString, box

import main
import agent.pilot_park_routes as ppr
import agent.park_route_validation as validation
import agent.loop_route_planner as planner
from agent.park_walk_planner import plan_park_walk
from agent.route_geometry import polyline_length_m
from agent.walk_planning_agent import run_walk_planning_agent

client = TestClient(main.app)


def body(park="songgang", minutes=40):
    lat, lon, _ = ppr.PILOT_PARK_CENTERS[park]
    return dict(dog_name="초코", speed_kmh=2.8, target_duration_minutes=minutes,
                origin_mode="park", pilot_park_id=park, origin_lat=lat, origin_lon=lon)


def flatten(route):
    coords = []
    for feature in route["features"]:
        points = feature["geometry"]["coordinates"]
        coords.extend(points[1:] if coords and coords[-1] == points[0] else points)
    return coords


def test_songgang_40_minutes_checks_every_advertised_course(caplog):
    with caplog.at_level("INFO"):
        response = client.post("/api/v1/walk/plan", json=body())
    assert response.status_code == 200, response.text
    data = response.json()
    polygon = ppr.load_pilot_park_polygons()["songgang"]
    graph = validation.build_park_graph("songgang")
    assert data["validated_park_id"] == "songgang"
    assert len(data["courses"]) == 3
    for course in data["courses"]:
        coords = flatten(data["course_plans"][course["id"]]["route"])
        checked = data["route_validation"][course["id"]]
        assert polygon.covers(LineString(coords))
        assert all(graph.has_edge(tuple(a), tuple(b)) for a, b in zip(coords, coords[1:]))
        assert coords[0] == coords[-1]
        assert checked["distance_m"] == pytest.approx(polyline_length_m(coords), abs=0.1)
        assert checked["estimated_minutes"] == pytest.approx(polyline_length_m(coords) / (2800 / 60), abs=0.1)
        assert course["estimatedMinutes"] <= 50
        assert checked["boundary_tolerance_m"] == 0
        assert checked["boundary_source"] == "https://www.openstreetmap.org/way/564388430"
    assert data["request_id"] in caplog.text
    assert "walk_candidate_validated" in caplog.text
    assert not ppr.is_route_inside_park_boundary(ppr.SONGGANG_PARK_OSM_COORDS, "songgang")


@pytest.mark.parametrize("park", ["yurim", "songgang", "sejong", "doan"])
@pytest.mark.parametrize("minutes", [10, 30, 40, 90])
def test_verified_parks_stay_on_internal_edges(park, minutes):
    lat, lon, _ = ppr.PILOT_PARK_CENTERS[park]
    plan = planner._plan_static_pilot_park(lat, lon, 1, park, 2800 / 60 * minutes)
    assert validation.validate_park_route(plan.coords, park, 2.8, minutes, (lon, lat))["passed"]
    assert plan.distance_m <= 2800 / 60 * minutes * 1.25


@pytest.mark.parametrize("park", ["sejong", "doan"])
def test_unverified_boundaries_are_not_successes(park, monkeypatch):
    # 로더는 verified_osm 이 아닌 경계를 버린다. 경계가 빠진 상태를 만들어 미검증 거점과 같은 조건을 재현한다.
    polygons = dict(ppr.load_pilot_park_polygons())
    polygons.pop(park)
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", polygons)
    response = client.post("/api/v1/walk/plan", json=body(park))
    assert response.status_code == 422
    assert response.json()["code"] == "BOUNDARY_DATA_UNAVAILABLE"
    assert "geojson" not in response.json()


def test_unknown_id_does_not_choose_nearby_park():
    request = body()
    request["pilot_park_id"] = "unknown"
    response = client.post("/api/v1/walk/plan", json=request)
    assert response.status_code == 422
    assert response.json()["code"] == "BOUNDARY_DATA_UNAVAILABLE"


def test_legacy_songgang_origin_is_not_teleported():
    request = body()
    request.update(origin_lat=36.4315, origin_lon=127.3805)
    response = client.post("/api/v1/walk/plan", json=request)
    assert response.status_code == 422
    assert response.json()["code"] == "ORIGIN_NOT_CONNECTED"


def test_park_mode_never_calls_live_or_rectangle(monkeypatch):
    def unexpected(*args, **kwargs):
        pytest.fail("Unconstrained routing must not run for a park")
    monkeypatch.setattr(planner, "_plan_live", unexpected)
    monkeypatch.setattr(planner, "_plan_rectangle_fallback", unexpected)
    assert client.post("/api/v1/walk/plan", json=body()).status_code == 200
    assert client.post("/api/v1/walk/plan", json=body("sejong")).status_code == 200
    unknown = body()
    unknown["pilot_park_id"] = "unknown"
    assert client.post("/api/v1/walk/plan", json=unknown).status_code == 422


def agent_result():
    request = body()
    return run_walk_planning_agent(user_query="40분 산책", origin_lat=request["origin_lat"],
                                   origin_lon=request["origin_lon"], origin_mode="park", pilot_park_id="songgang")


def test_api_discards_bad_best_and_returns_verified_alternatives(monkeypatch):
    result = agent_result()
    bad = result.all_scored_candidates[0].candidate
    bad.geojson_coordinates = copy.deepcopy(ppr.SONGGANG_PARK_OSM_COORDS)
    result.best_route = bad
    monkeypatch.setattr(main, "run_walk_planning_agent", lambda **kwargs: result)
    # 공원 중심 출발로 만든 가짜 결과를 검증하므로, 주차장 자동 출발(#183)은 끈다
    monkeypatch.setattr(main, "_park_center_to_parking", lambda *args, **kwargs: None)
    response = client.post("/api/v1/walk/plan", json=body())
    assert response.status_code == 200
    data = response.json()
    assert bad.route_id not in data["course_plans"]
    assert bad.route_id not in {course["id"] for course in data["courses"]}
    assert len(data["courses"]) == 2


def test_api_blocks_injected_empty_fallback(monkeypatch):
    result = agent_result()
    for scored in result.all_scored_candidates:
        scored.candidate.geojson_coordinates = []
    monkeypatch.setattr(main, "run_walk_planning_agent", lambda **kwargs: result)
    # 공원 중심 출발로 만든 가짜 결과를 검증하므로, 주차장 자동 출발(#183)은 끈다
    monkeypatch.setattr(main, "_park_center_to_parking", lambda *args, **kwargs: None)
    response = client.post("/api/v1/walk/plan", json=body())
    assert response.status_code == 422
    assert response.json()["code"] == "ROUTE_VALIDATION_FAILED"
    assert "geojson" not in response.json()


def test_api_recalculates_metadata_from_final_geometry(monkeypatch):
    result = agent_result()
    for scored in result.all_scored_candidates:
        scored.candidate.total_distance_m = 999999
        scored.candidate.estimated_duration_minutes = 9999
    monkeypatch.setattr(main, "run_walk_planning_agent", lambda **kwargs: result)
    # 공원 중심 출발로 만든 가짜 결과를 검증하므로, 주차장 자동 출발(#183)은 끈다
    monkeypatch.setattr(main, "_park_center_to_parking", lambda *args, **kwargs: None)
    response = client.post("/api/v1/walk/plan", json=body())
    assert response.status_code == 200
    assert all(c["estimatedMinutes"] < 50 for c in response.json()["courses"])


def test_overlong_walk_is_rejected():
    lat, lon, _ = ppr.PILOT_PARK_CENTERS["songgang"]
    coords = plan_park_walk("songgang", lat, lon, 1800, 1)
    with pytest.raises(validation.RoutePlanningError) as error:
        validation.validate_park_route(coords, "songgang", 2.8, 10)
    assert error.value.code == "ROUTE_DURATION_OUT_OF_RANGE"


def test_disconnected_network_cannot_make_a_loop(monkeypatch):
    graph = nx.Graph()
    graph.add_edge((127, 36), (127.0001, 36), weight=10)
    nx.add_cycle(graph, [(127.001, 36), (127.0011, 36), (127.0011, 36.0001)])
    monkeypatch.setattr("agent.park_walk_planner.build_park_graph", lambda park: graph)
    with pytest.raises(validation.RoutePlanningError) as error:
        plan_park_walk("songgang", 36, 127, 1000, 1)
    assert error.value.code == "NO_VALID_LOOP"


def test_missing_walk_data_fails_closed(monkeypatch):
    monkeypatch.setattr(validation, "load_park_networks", lambda: {})
    with pytest.raises(validation.RoutePlanningError) as error:
        validation.build_park_graph("songgang")
    assert error.value.code == "WALK_NETWORK_UNAVAILABLE"


def test_graph_drops_crossing_segments_and_access_restrictions(monkeypatch):
    polygon = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (3, 1), (3, 3), (1, 3)]])
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"test": polygon})
    ways = [
        {"way_id": "ok", "tags": {"highway": "path"}, "coordinates": [[0, 0], [4, 0]]},
        {"way_id": "hole", "tags": {"highway": "path"}, "coordinates": [[0.5, 2], [3.5, 2]]},
        {"way_id": "private", "tags": {"highway": "path", "access": "private"}, "coordinates": [[0, 0], [0, 4]]},
        {"way_id": "steps", "tags": {"highway": "steps"}, "coordinates": [[4, 0], [4, 4]]},
    ]
    monkeypatch.setattr(validation, "load_park_networks", lambda: {"test": {"ways": ways}})
    graph = validation.build_park_graph("test")
    assert list(graph.edges) == [((0, 0), (4, 0))]


def test_inside_polygon_but_off_walk_network_is_rejected():
    graph = validation.build_park_graph("songgang")
    a = next(iter(graph))
    b = next(n for n in graph if n != a and not graph.has_edge(a, n)
             and ppr.is_route_inside_park_boundary([list(a), list(n)], "songgang"))
    with pytest.raises(validation.RoutePlanningError) as error:
        validation.validate_park_route([list(a), list(b), list(a), list(b), list(a)], "songgang", 2.8, 40)
    assert error.value.code == "ROUTE_VALIDATION_FAILED"


def test_health_includes_deployment_commit(monkeypatch):
    monkeypatch.setenv("RENDER_GIT_COMMIT", "6d76a93abcdef0123456789")
    assert client.get("/health").json()["commit"] == "6d76a93"


def test_boundary_contact_holes_and_crossing_segments(monkeypatch):
    polygon = Polygon([(0, 0), (4, 0), (4, 4), (0, 4)], holes=[[(1, 1), (3, 1), (3, 3), (1, 3)]])
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"test": polygon})
    assert ppr.is_route_inside_park_boundary([[0, 0], [4, 0]], "test")
    assert not ppr.is_route_inside_park_boundary([[0.5, 2], [3.5, 2]], "test")
    assert not ppr.is_route_inside_park_boundary([[0, -0.00001], [1, -0.00001]], "test")


def test_multipolygon_gaps_invalid_shapes_and_coordinates(monkeypatch):
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"test": MultiPolygon([box(0, 0, 1, 1), box(2, 0, 3, 1)])})
    assert ppr.is_route_inside_park_boundary([[0, 0], [1, 0]], "test")
    assert not ppr.is_route_inside_park_boundary([[0.5, 0.5], [2.5, 0.5]], "test")
    for coords in (None, [], [[0, 0]], [[float("nan"), 0], [1, 0]], [[36, 127], [36.1, 127]], [[True, 0], [1, 0]], [[0], [1, 1]]):
        assert not ppr.is_route_inside_park_boundary(coords, "test")
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"test": Polygon([(0, 0), (1, 1), (0, 1), (1, 0)])})
    assert not ppr.is_route_inside_park_boundary([[0, 0], [1, 0]], "test")


@pytest.mark.parametrize("contents", ["{broken", '{"features": []}'])
def test_missing_or_corrupt_boundary_fails_closed(tmp_path, monkeypatch, contents):
    path = tmp_path / "boundary.json"
    path.write_text(contents)
    monkeypatch.setattr(ppr, "PARK_BOUNDARIES_PATH", path)
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", None)
    assert ppr.load_pilot_park_polygons() == {}
    with pytest.raises(validation.RoutePlanningError) as error:
        validation.build_park_graph("songgang")
    assert error.value.code == "BOUNDARY_DATA_UNAVAILABLE"
