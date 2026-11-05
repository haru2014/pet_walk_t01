"""[US-B1, US-B3, US-20] 산책 환경 조건(차가 적은 길·조용한 길·쉬어가기·계단·폭신한 길)이 경로 선택에 반영되는지 검증.

외부 Overpass 를 부르지 않도록 가상의 OSM 지역(OsmRegion)을 직접 만든다.
지형 (기준점 경도 127.0, 위도 36.0, 단위 m):
- y=-30 동서 큰길(secondary), y=-20 그 옆 보도(footway=sidewalk)
- y=150~550, x=-400~400 공원(leisure=park). 공원 안 흙길 순환로 x=±300, y=200~500
- 보도에서 공원으로 올라가는 보행로 x=-300, 0, 300 (y=-20 → 200)
- 공원 순환로 위 벤치 2곳, 보도 위 횡단보도 3곳
"""

import math

import networkx as nx
import pytest

from agent.osm_overpass_client import OsmRegion, parse_overpass
from agent.osm_walk_graph import build_walk_graph
from agent.preference_loop_planner import LoopQuery, plan_preference_loops
from agent.walk_edge_cost import edge_cost
from services.course_notices import append_notice_lines, preference_notice_lines
from services.route_exposure import measure_route_exposure
from services.walk_preferences import WalkPreferences, intent_overrides_from_request, request_flags

LON0, LAT0 = 127.0, 36.0
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_540.0
BEARINGS = {1: 0.0, 2: 330.0, 3: 30.0}


def p(x: float, y: float):
    return [LON0 + x / KX, LAT0 + y / KY]


def line(points, step=50.0):
    out = []
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) // step))
        out.extend(p(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n))
    out.append(p(*points[-1]))
    return out


def way(way_id, coords, **tags):
    return {"id": way_id, "tags": tags, "coords": coords}


@pytest.fixture
def region() -> OsmRegion:
    ways = [
        way("road", line([(-800, -30), (800, -30)], 100), highway="secondary"),
        way("sidewalk", line([(-800, -20), (800, -20)], 100), highway="footway", footway="sidewalk"),
        way("park_loop", line([(-300, 200), (300, 200), (300, 500), (-300, 500), (-300, 200)]),
            highway="path", surface="dirt"),
        way("park_mid", line([(0, 200), (0, 500)]), highway="path", surface="dirt"),
    ]
    for x in (-300, 0, 300):
        ways.append(way(f"link_{x}", line([(x, -20), (x, 200)]), highway="footway", surface="paving_stones"))
    park = [p(-400, 150), p(400, 150), p(400, 550), p(-400, 550)]
    return OsmRegion(
        center=(LON0, LAT0), radius_m=1200.0, ways=ways, parks=[park],
        crossings=[p(-200, -20), p(100, -20), p(500, -20)],
        rest_points=[p(-300, 350), p(300, 350)],
    )


@pytest.fixture
def walk(region):
    graph = build_walk_graph(region)
    assert graph is not None
    return graph


def _loop_exposure(walk, prefs, target=1800.0):
    loops = plan_preference_loops(walk, LoopQuery(tuple(p(-100, -20)), target, prefs, BEARINGS))
    assert loops, "가상 지역에서 순환 코스를 찾지 못했다"
    return loops, {v: measure_route_exposure(loop.coords, walk) for v, loop in loops.items()}


def _edges_at(walk, y_m: float):
    """y 좌표가 y_m(±3m) 인 동서 방향 간선 속성."""
    lat = LAT0 + y_m / KY
    tol = 3.0 / KY
    return [d for u, v, d in walk.graph.edges(data=True) if abs(u[1] - lat) < tol and abs(v[1] - lat) < tol]


def test_edge_context_classifies_sidewalk_and_park(walk):
    assert {d["road_context"] for d in _edges_at(walk, -30)} == {"major"}       # 큰길
    assert {d["road_context"] for d in _edges_at(walk, -20)} == {"major"}       # 큰길 옆 보도
    park_top = _edges_at(walk, 500)
    assert park_top and all(d["road_context"] == "path" and d["in_park"] for d in park_top)


def test_avoid_traffic_prices_sidewalk_above_park_path(walk):
    prefs = WalkPreferences(avoid_traffic=True)
    sidewalk = next(d for _u, _v, d in walk.graph.edges(data=True) if d["highway"] == "footway" and d["road_context"] == "major")
    park_path = next(d for _u, _v, d in walk.graph.edges(data=True) if d["in_park"])
    per_m_side = edge_cost(sidewalk, prefs) / sidewalk["length"]
    per_m_park = edge_cost(park_path, prefs) / park_path["length"]
    assert per_m_side >= 4 * per_m_park
    assert edge_cost(sidewalk, WalkPreferences()) == pytest.approx(sidewalk["length"])


def test_avoid_traffic_loop_has_less_road_exposure(walk):
    _plain_loops, plain = _loop_exposure(walk, WalkPreferences())
    _loops, avoid = _loop_exposure(walk, WalkPreferences(avoid_traffic=True))
    best_avoid = min(e["road_exposure_ratio"] for e in avoid.values())
    best_plain = min(e["road_exposure_ratio"] for e in plain.values())
    assert best_avoid <= best_plain
    assert best_avoid < 0.35


def test_park_attraction_marks_variant_one(walk):
    loops, _ = _loop_exposure(walk, WalkPreferences(avoid_traffic=True))
    assert loops[1].park_attraction is True
    loops_plain, _ = _loop_exposure(walk, WalkPreferences(prefer_rest=True))
    assert loops_plain[1].park_attraction is False


def test_avoid_stairs_hides_steps_edges(region):
    region.ways.append(way("stairs", line([(-150, -20), (-150, 200)]), highway="steps"))
    graph = build_walk_graph(region)
    steps = next(d for _u, _v, d in graph.graph.edges(data=True) if d["steps"])
    assert math.isinf(edge_cost(steps, WalkPreferences(avoid_stairs=True)))
    assert not math.isinf(edge_cost(steps, WalkPreferences()))


def test_exposure_counts_crossings_and_rest_spots(walk):
    along_sidewalk = line([(-250, -20), (550, -20)], 25)
    exposure = measure_route_exposure(along_sidewalk, walk)
    assert exposure["crossing_count"] == 3  # x=-200, 100, 500
    assert exposure["road_exposure_ratio"] == pytest.approx(1.0)
    in_park = line([(-300, 250), (-300, 450)], 25)
    assert measure_route_exposure(in_park, walk)["rest_spot_count"] == 1
    assert measure_route_exposure(in_park, walk)["road_exposure_ratio"] == pytest.approx(0.0)


def test_exposure_unknown_without_graph():
    exposure = measure_route_exposure(line([(0, 0), (100, 0)]), None)
    assert exposure["road_exposure_ratio"] is None and exposure["exposure_source"] is None


def test_notice_reports_measured_road_ratio():
    prefs = WalkPreferences(avoid_traffic=True, prefer_rest=True)
    exposure = {"road_exposure_ratio": 0.22, "major_road_ratio": 0.1, "crossing_count": 3,
                "rest_spot_count": 0, "exposure_source": "osm"}
    lines = preference_notice_lines(prefs, exposure, preference_routed=True)
    assert lines[0] == "보행 전용로가 부족해 차도 옆 구간이 약 22% 포함돼요 (큰길 옆 10%)"
    quiet_lane = {**exposure, "major_road_ratio": 0.0}
    assert preference_notice_lines(prefs, quiet_lane, True)[0] == "보행 전용로가 부족해 차도 옆 구간이 약 22% 포함돼요"
    assert "횡단보도를 3번 건너요" in lines
    assert "코스 30m 안에 지도에 등록된 벤치·쉼터가 없어요" in lines


def test_notice_admits_missing_data_and_fallback():
    prefs = WalkPreferences(avoid_traffic=True, prefer_quiet=True)
    missing = preference_notice_lines(prefs, {"exposure_source": None}, preference_routed=False)
    assert missing == ["주변 길 정보를 불러오지 못해 '차가 적은 길·조용한 길' 조건을 확인하지 못했어요"]
    fallback = preference_notice_lines(prefs, {"exposure_source": "osm", "road_exposure_ratio": 0.05}, False)
    assert fallback[0].startswith("조건을 반영한 길 찾기에 실패해")
    assert preference_notice_lines(WalkPreferences(prefer_soft=True), {}, True) == []


def test_append_notice_keeps_existing_park_notice():
    course = {"notice": "산책로가 짧아 최대 약 12분이에요"}
    append_notice_lines(course, ["횡단보도를 2번 건너요"])
    assert course["notice"] == "산책로가 짧아 최대 약 12분이에요\n횡단보도를 2번 건너요"


def test_request_flags_from_environment_chips():
    req = {"environments": ["traffic", "rest"], "avoid_stairs": True}
    assert request_flags(req) == {
        "prefer_cushion": False, "prefer_shade": False, "avoid_stairs": True,
        "avoid_traffic": True, "prefer_quiet": False, "prefer_rest": True,
    }
    overrides = intent_overrides_from_request(req)
    assert overrides["avoid_traffic"] is True and overrides["prefer_soft"] is False
    assert intent_overrides_from_request({"prefer_shade": True}) == {"shade_priority": True}


def test_preferences_from_intent():
    prefs = WalkPreferences.from_intent({"preferred_surfaces": ["dirt"], "avoid_traffic": True})
    assert prefs.prefer_soft and prefs.avoid_traffic and prefs.needs_road_context


def test_parse_overpass_sorts_elements():
    payload = {"elements": [
        {"type": "way", "id": 1, "tags": {"highway": "footway"},
         "geometry": [{"lon": 127.0, "lat": 36.0}, {"lon": 127.001, "lat": 36.0}]},
        {"type": "way", "id": 2, "tags": {"leisure": "park"},
         "geometry": [{"lon": 127.0, "lat": 36.0}, {"lon": 127.001, "lat": 36.0}, {"lon": 127.001, "lat": 36.001}]},
        {"type": "node", "id": 3, "lon": 127.0, "lat": 36.0, "tags": {"highway": "crossing"}},
        {"type": "node", "id": 4, "lon": 127.0, "lat": 36.0, "tags": {"amenity": "bench"}},
    ], "osm3s": {"timestamp_osm_base": "2026-11-01T00:00:00Z"}}
    region = parse_overpass(payload, (127.0, 36.0), 600.0)
    assert len(region.ways) == 1 and len(region.parks) == 1
    assert len(region.crossings) == 1 and len(region.rest_points) == 1
    assert region.osm_base == "2026-11-01T00:00:00Z"
    assert nx.__version__
