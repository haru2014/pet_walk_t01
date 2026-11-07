"""[US-20] 차가 적은 길·조용한 길·쉬어가기 좋은 길이 '어느 길을 고를지'를 실제로 바꾸는지 검증.

운영 QA: 세 조건을 켜도 코스가 달라지지 않았다. 원인은 조건을 반영한 그래프 코스가
상위 단계의 왕복 기준(15%)에서 탈락하고, 그 자리를 조건 무시 OSRM 경로가 채운 것이었다.
비용 모델 자체도 조건별로 모자랐다.
- 차가 적은 길: 큰길 25m 라는 이진 판정뿐이어서 간선도로 36m 옆 보도와 공원 산책로가 같은 값이었다
- 조용한 길: '복잡하지 않은 길' 개념이 없었다 (교차로·회전 비용 없음)
- 쉬어가기 좋은 길: 공원 할인과 공원 유인에서 빠져 있었고 정자를 수집하지 않았다
"""

import math

import pytest

from agent.loop_attraction import attraction_for, rest_cluster_center
from agent.loop_quality import loop_penalty
from agent.osm_region import OsmRegion, parse_overpass
from agent.osm_walk_graph import build_walk_graph
from agent.route_geometry import turn_count, turn_density
from agent.walk_edge_cost import QUIET_JUNCTION_COST_M, edge_cost, traffic_distance_relief
from services.walk_preferences import WalkPreferences

LON0, LAT0 = 127.0, 36.0
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_540.0


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


def _edge_at(walk, y_m: float):
    """y 좌표가 y_m(±3m) 인 동서 방향 간선 속성 하나."""
    lat = LAT0 + y_m / KY
    tol = 3.0 / KY
    return next(d for u, v, d in walk.graph.edges(data=True)
                if abs(u[1] - lat) < tol and abs(v[1] - lat) < tol)


@pytest.fixture
def distance_walk():
    """간선도로 y=0, 그 옆 보도 y=20, 40m 보행로, 200m 보행로."""
    ways = [
        way("major_road", line([(-400, 0), (400, 0)], 100), highway="primary"),
        way("walk_20", line([(-400, 20), (400, 20)], 100), highway="footway"),
        way("walk_40", line([(-400, 40), (400, 40)], 100), highway="footway"),
        way("walk_200", line([(-400, 200), (400, 200)], 100), highway="footway"),
        way("link", line([(0, 20), (0, 200)]), highway="footway"),
    ]
    return build_walk_graph(OsmRegion(center=(LON0, LAT0), radius_m=800.0, ways=ways))


@pytest.fixture
def grid_walk():
    """100m 격자 주택가 (교차로가 많은 복잡한 길)."""
    ways = []
    for i in range(5):
        ways.append(way(f"h{i}", line([(-200, i * 100), (200, i * 100)]), highway="residential"))
        ways.append(way(f"v{i}", line([(i * 100 - 200, 0), (i * 100 - 200, 400)]), highway="residential"))
    return build_walk_graph(OsmRegion(center=(LON0, LAT0), radius_m=800.0, ways=ways))


class TestAvoidTrafficDistanceGradient:
    """차가 적은 길: 도로와 먼 인도를 실제로 더 싸게 본다."""

    def test_road_distance_is_measured_on_every_edge(self, distance_walk):
        assert _edge_at(distance_walk, 0)["road_distance_m"] == pytest.approx(0.0)
        assert _edge_at(distance_walk, 20)["road_distance_m"] == pytest.approx(20.0, abs=1.0)
        assert _edge_at(distance_walk, 40)["road_distance_m"] == pytest.approx(40.0, abs=1.0)
        assert _edge_at(distance_walk, 200)["road_distance_m"] is None  # 150m 밖 = 충분히 멀다

    def test_farther_sidewalk_costs_less(self, distance_walk):
        prefs = WalkPreferences(avoid_traffic=True)
        near, mid, far = (_edge_at(distance_walk, y) for y in (20, 40, 200))
        per_m = [edge_cost(e, prefs) / e["length"] for e in (near, mid, far)]
        assert per_m[0] > per_m[1] > per_m[2], f"거리별 비용이 단조 감소하지 않음: {per_m}"
        assert per_m[2] < 0.8  # 기본 보행 전용로 배수보다 싸다

    def test_major_road_penalty_is_unchanged(self, distance_walk):
        """큰길 옆(25m 안)은 깎지 않는다 - 기존 10배 페널티가 그대로 유지된다."""
        edge = _edge_at(distance_walk, 20)
        assert edge["road_context"] == "major"
        assert traffic_distance_relief(edge) == 1.0
        cost = edge_cost(edge, WalkPreferences(avoid_traffic=True))
        assert cost == pytest.approx(edge["length"] * 10.0)

    def test_no_preference_means_plain_distance(self, distance_walk):
        edge = _edge_at(distance_walk, 40)
        assert edge_cost(edge, WalkPreferences()) == pytest.approx(edge["length"])


class TestQuietComplexity:
    """조용한 길: 복잡하지 않은 경로를 고른다."""

    def test_junction_degree_is_tagged(self, grid_walk):
        degrees = [d["junction_degree"] for _u, _v, d in grid_walk.graph.edges(data=True)]
        assert max(degrees) >= 4
        assert min(degrees) == 2

    def test_busy_junction_costs_extra_only_when_quiet(self, grid_walk):
        busy = next(d for _u, _v, d in grid_walk.graph.edges(data=True) if d["junction_degree"] >= 4)
        plain = next(d for _u, _v, d in grid_walk.graph.edges(data=True) if d["junction_degree"] == 2)
        quiet = WalkPreferences(prefer_quiet=True)
        base = busy["length"] * 1.3  # QUIET_MULTIPLIER["minor"]
        assert edge_cost(busy, quiet) == pytest.approx(base + QUIET_JUNCTION_COST_M)
        assert edge_cost(plain, quiet) == pytest.approx(plain["length"] * 1.3)
        assert edge_cost(busy, WalkPreferences()) == pytest.approx(busy["length"])

    def test_turn_density_separates_zigzag_from_straight(self):
        zigzag = line([(0, 0), (100, 0), (100, 100), (200, 100), (200, 200), (300, 200)])
        straight = line([(0, 0), (500, 0)])
        assert turn_count(zigzag) == 4
        assert turn_count(straight) == 0
        assert turn_density(zigzag) > turn_density(straight)

    def test_quiet_penalty_prefers_simple_route(self):
        zigzag = line([(0, 0), (100, 0), (100, 100), (200, 100), (200, 200), (300, 200)])
        straight = line([(0, 0), (500, 0)])
        quiet = WalkPreferences(prefer_quiet=True)
        assert loop_penalty(zigzag, 500.0, 500.0, quiet) > loop_penalty(straight, 500.0, 500.0, quiet)
        plain = WalkPreferences()
        assert loop_penalty(zigzag, 500.0, 500.0, plain) == pytest.approx(
            loop_penalty(straight, 500.0, 500.0, plain)
        )


class TestRestPreference:
    """쉬어가기 좋은 길: 공원 근처·벤치·정자가 있는 경로."""

    @pytest.fixture
    def rest_walk(self):
        ways = [
            way("main", line([(-500, 0), (500, 0)]), highway="footway"),
            way("up", line([(300, 0), (300, 400)]), highway="footway"),
        ]
        region = OsmRegion(center=(LON0, LAT0), radius_m=800.0, ways=ways,
                           rest_points=[p(300, 300), p(310, 320), p(290, 340)])
        return build_walk_graph(region)

    def test_pavilion_way_is_collected_as_rest_point(self):
        """정자(leisure=pavilion)·쉼터 건물은 중심점으로 쉼터 목록에 들어간다."""
        payload = {"elements": [
            {"type": "way", "id": 1, "tags": {"leisure": "pavilion"},
             "geometry": [{"lon": c[0], "lat": c[1]} for c in (p(0, 0), p(10, 0), p(10, 10), p(0, 10))]},
            {"type": "node", "id": 2, "lon": p(50, 0)[0], "lat": p(50, 0)[1],
             "tags": {"leisure": "pavilion"}},
            {"type": "node", "id": 3, "lon": p(80, 0)[0], "lat": p(80, 0)[1],
             "tags": {"amenity": "bench"}},
        ]}
        region = parse_overpass(payload, (LON0, LAT0), 600.0)
        assert len(region.rest_points) == 3

    def test_rest_distance_discounts_nearby_edges(self, rest_walk):
        prefs = WalkPreferences(prefer_rest=True)
        near = next(d for _u, _v, d in rest_walk.graph.edges(data=True)
                    if (d["rest_distance_m"] or 999.0) <= 30.0)
        far = next(d for _u, _v, d in rest_walk.graph.edges(data=True)
                   if d["rest_distance_m"] is None)
        assert edge_cost(near, prefs) / near["length"] < edge_cost(far, prefs) / far["length"]
        assert edge_cost(near, WalkPreferences()) == pytest.approx(near["length"])

    def test_rest_cluster_center_prefers_dense_group(self, rest_walk):
        start = rest_walk.nearest_node(p(0, 0))
        center = rest_cluster_center(rest_walk, start)
        assert center is not None
        assert abs((center[0] - LON0) * KX - 300.0) < 40.0
        assert abs((center[1] - LAT0) * KY - 320.0) < 40.0

    def test_rest_preference_gets_a_waypoint(self, rest_walk):
        start = rest_walk.nearest_node(p(0, 0))
        attraction = attraction_for(rest_walk, start, WalkPreferences(prefer_rest=True))
        assert attraction is not None and attraction.waypoint is not None

    def test_other_preferences_get_no_rest_waypoint(self, rest_walk):
        start = rest_walk.nearest_node(p(0, 0))
        assert attraction_for(rest_walk, start, WalkPreferences(prefer_shade=True)) is None
        quiet = attraction_for(rest_walk, start, WalkPreferences(prefer_quiet=True))
        assert quiet is None or quiet.waypoint is None

    def test_rest_preference_discounts_park_paths(self):
        """예전에는 공원 할인이 prefer_rest 를 빼고 걸려 있어 공원을 노리지 않았다."""
        ways = [way("park_path", line([(-100, 0), (100, 0)]), highway="path", surface="dirt")]
        park = [p(-200, -100), p(200, -100), p(200, 100), p(-200, 100)]
        walk = build_walk_graph(OsmRegion(center=(LON0, LAT0), radius_m=600.0, ways=ways, parks=[park]))
        edge = next(d for _u, _v, d in walk.graph.edges(data=True) if d["in_park"])
        assert edge_cost(edge, WalkPreferences(prefer_rest=True)) < edge["length"]
