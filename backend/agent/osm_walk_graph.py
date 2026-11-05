"""[US-B1, US-B3, US-20] OSM 자료(OsmRegion)로 보행 그래프를 만들고 간선마다 주변 맥락을 붙인다.

간선 속성 (walk_edge_cost 가 비용으로, route_exposure 가 실측 지표로 쓴다):
- length, highway, steps, width_m, surface_category, surface_tagged
- road_context: 'path'(차도에서 떨어진 보행 전용로) / 'minor'(골목·이면도로 또는 그 옆) / 'major'(큰길 또는 그 옆 보도)
- crossing, crossing_major: 횡단 지점(횡단보도)을 지나는지, 큰길 횡단인지
- in_park, commercial, shaded, near_rest
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

import networkx as nx

from agent.geo_index import LocalProjection, PointGrid, PolygonSet
from agent.osm_overpass_client import SOURCE, OsmRegion
from agent.route_geometry import haversine_m
from agent.walk_edge_cost import MAJOR_ROADS, MINOR_ROADS, surface_category

Node = Tuple[float, float]

EXCLUDED_HIGHWAYS = {"motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed",
                     "bus_guideway", "raceway", "platform", "corridor", "elevator", "bridleway"}
DISALLOWED_ACCESS = {"no", "private", "customers", "permit", "delivery", "military"}
MAJOR_NEAR_M = 15.0          # 보행로 중심선이 큰길에서 이 거리 안이면 '큰길 옆'
MINOR_NEAR_M = 8.0           # 이면도로에서 이 거리 안이면 '골목 옆'
SIDEWALK_MAJOR_NEAR_M = 22.0  # footway=sidewalk 는 차도와 조금 떨어져 그려지는 경우가 많다
CROSSING_SNAP_M = 4.0
REST_NEAR_M = 30.0
TREE_ROW_NEAR_M = 8.0


@dataclass
class WalkGraph:
    graph: nx.Graph
    projection: LocalProjection
    node_grid: PointGrid
    edge_grid: PointGrid             # 간선 위 표본점 → (u, v)
    crossing_grid: PointGrid
    rest_grid: PointGrid
    parks: List[List[Node]] = field(default_factory=list)  # 공원별 그래프 노드 목록 (공원 유인 루프용)
    source: str = SOURCE
    osm_base: Optional[str] = None

    def nearest_node(self, lonlat: Sequence[float], max_m: float = 150.0) -> Optional[Node]:
        xy = self.projection.to_xy(lonlat)
        best, best_d = None, max_m
        for node in self.node_grid.within(xy, max_m):
            d = haversine_m(lonlat, node)
            if d <= best_d:
                best, best_d = node, d
        return best


def _key(point: Sequence[float]) -> Node:
    return (round(float(point[0]), 7), round(float(point[1]), 7))


def is_walkable(tags: Dict[str, Any]) -> bool:
    highway = tags.get("highway")
    if not highway or highway in EXCLUDED_HIGHWAYS:
        return False
    if tags.get("access") in DISALLOWED_ACCESS or tags.get("foot") in ("no", "private"):
        return False
    return not (highway == "cycleway" and tags.get("foot") not in ("yes", "designated", "permissive"))


def _width(tags: Dict[str, Any]) -> Optional[float]:
    try:
        return float(str(tags.get("width", "")).replace("m", "").strip())
    except ValueError:
        return None


class _Context:
    """간선 맥락 판정에 쓰는 색인 묶음."""

    def __init__(self, region: OsmRegion, proj: LocalProjection):
        self.major, self.minor = PointGrid(), PointGrid()
        road_grids = {**{h: self.major for h in MAJOR_ROADS}, **{h: self.minor for h in MINOR_ROADS}}
        for way in region.ways:
            grid = road_grids.get(way["tags"].get("highway"))
            if grid is not None:
                grid.add_line([proj.to_xy(p) for p in way["coords"]], True)
        self.crossings, self.rest, self.tree_rows = PointGrid(), PointGrid(), PointGrid()
        for point in region.crossings:
            self.crossings.add(proj.to_xy(point), _key(point))
        for point in region.rest_points:
            self.rest.add(proj.to_xy(point), _key(point))
        for line in region.shade_lines:
            self.tree_rows.add_line([proj.to_xy(p) for p in line], True)
        self.parks, self.commercial, self.woods = PolygonSet(), PolygonSet(), PolygonSet()
        for target, rings in ((self.parks, region.parks), (self.commercial, region.commercial),
                              (self.woods, region.shade_areas)):
            for ring in rings:
                target.add([proj.to_xy(p) for p in ring])

    def road_context(self, tags: Dict[str, Any], mid) -> str:
        highway = tags.get("highway")
        if highway in MAJOR_ROADS:
            return "major"
        if highway in MINOR_ROADS:
            return "minor"
        major_reach = SIDEWALK_MAJOR_NEAR_M if tags.get("footway") == "sidewalk" else MAJOR_NEAR_M
        if self.major.any_within(mid, major_reach):
            return "major"
        if tags.get("footway") == "sidewalk" or self.minor.any_within(mid, MINOR_NEAR_M):
            return "minor"
        return "path"

    def crossing(self, tags: Dict[str, Any], a_xy, b_xy) -> bool:
        if tags.get("footway") == "crossing" or tags.get("crossing") not in (None, "no"):
            return True
        return self.crossings.any_within(a_xy, CROSSING_SNAP_M) or self.crossings.any_within(b_xy, CROSSING_SNAP_M)


def _edge_attrs(ctx: _Context, tags: Dict[str, Any], a_xy, b_xy, length: float) -> Dict[str, Any]:
    mid = ((a_xy[0] + b_xy[0]) / 2, (a_xy[1] + b_xy[1]) / 2)
    crossing = ctx.crossing(tags, a_xy, b_xy)
    return {
        "length": length,
        "highway": tags.get("highway"),
        "steps": tags.get("highway") == "steps",
        "width_m": _width(tags),
        "surface_category": surface_category(tags.get("surface"), tags.get("highway")),
        "surface_tagged": isinstance(tags.get("surface"), str),
        "road_context": ctx.road_context(tags, mid),
        "crossing": crossing,
        "crossing_major": crossing and ctx.major.any_within(mid, MAJOR_NEAR_M + 5.0),
        "in_park": ctx.parks.contains(mid),
        "commercial": ctx.commercial.contains(mid),
        "shaded": ctx.woods.contains(mid) or ctx.tree_rows.any_within(mid, TREE_ROW_NEAR_M),
        "near_rest": ctx.rest.any_within(mid, REST_NEAR_M),
    }


def _add_way(walk: WalkGraph, ctx: _Context, way: Dict[str, Any]) -> None:
    tags = way["tags"]
    if not is_walkable(tags):
        return
    proj = walk.projection
    for a, b in zip(way["coords"], way["coords"][1:]):
        u, v = _key(a), _key(b)
        length = haversine_m(u, v)
        if u == v or length < 0.5:
            continue
        existing = walk.graph.get_edge_data(u, v)
        if existing and existing["length"] <= length:
            continue
        a_xy, b_xy = proj.to_xy(u), proj.to_xy(v)
        walk.graph.add_edge(u, v, **_edge_attrs(ctx, tags, a_xy, b_xy, length))
        walk.edge_grid.add_line([a_xy, b_xy], (u, v), spacing_m=6.0)


def _park_nodes(walk: WalkGraph, ctx: _Context) -> List[List[Node]]:
    """공원마다 그 안에 있는 그래프 노드 (공원 하나에 노드 5개 이상인 것만)."""
    groups: List[List[Node]] = []
    projected = [(node, walk.projection.to_xy(node)) for node in walk.graph.nodes]
    for ring in ctx.parks.rings():
        single = PolygonSet()
        single.add(ring)
        nodes = [node for node, xy in projected if single.contains(xy)]
        if len(nodes) >= 5:
            groups.append(nodes)
    return groups


def build_walk_graph(region: OsmRegion) -> Optional[WalkGraph]:
    """보행 가능한 길이 없으면 None."""
    proj = LocalProjection(region.center)
    ctx = _Context(region, proj)
    walk = WalkGraph(graph=nx.Graph(), projection=proj, node_grid=PointGrid(40.0), edge_grid=PointGrid(20.0),
                     crossing_grid=ctx.crossings, rest_grid=ctx.rest, osm_base=region.osm_base)
    for way in region.ways:
        _add_way(walk, ctx, way)
    if walk.graph.number_of_edges() == 0:
        return None
    for node in walk.graph.nodes:
        walk.node_grid.add(proj.to_xy(node), node)
    walk.parks = _park_nodes(walk, ctx)
    return walk
