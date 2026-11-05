"""[US-A3, US-B3, US-20] 환경 조건을 비용으로 반영한 순환 코스 탐색 (현재 위치 모드).

출발점 → 경유점1 → 경유점2 → 출발점 삼각 순환을 OSM 보행 그래프에서 '선호 비용' 최단 경로로 잇는다.
- 간선 비용은 walk_edge_cost.edge_cost (차가 적은 길이면 큰길 옆 보도가 4배 비싸다 등)
- 앞 구간에서 지난 간선은 REUSE_PENALTY 배로 비싸게 해 같은 길 왕복 대신 순환이 되게 한다
- 실측 길이가 목표와 다르면 경유점 거리를 비율로 고쳐 다시 찾는다 (최대 MAX_ITERATIONS 번)
- 공원 유인(3단계): 차가 적은 길·조용한 길·폭신한 길이 켜져 있고 800m 안에 공원이 있으면
  1안은 공원 쪽으로 방향을 잡는다. 공원 안 길은 비용이 싸서 순환이 공원을 지나게 된다
"""

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Set, Tuple

import networkx as nx

from agent.osm_walk_graph import Node, WalkGraph
from agent.route_geometry import backtrack_ratio, bearing_deg, collapse_backtracks, destination_point, haversine_m
from agent.walk_edge_cost import edge_cost
from services.walk_preferences import WalkPreferences

REUSE_PENALTY = 5.0
WAYPOINT_SPREAD_DEG = 40.0
LOOP_PERIMETER_FACTOR = 4.3   # 경유점 거리 r 대비 실제 순환 길이 추정 (삼각 둘레 3.29r × 우회 1.3)
MAX_ITERATIONS = 5
DISTANCE_TOLERANCE = 0.12
SCALE_LIMITS = (0.5, 2.0)
WAYPOINT_SNAP_M = (200.0, 400.0)
MAX_BACKTRACK = 0.30
PARK_ATTRACTION_M = 800.0
START_SNAP_M = 150.0
# OSM 보도는 끊긴 조각으로 그려진 경우가 많다. 이보다 작은 연결 조각에서는 출발하지 않는다
MIN_COMPONENT_NODES = 200


@dataclass(frozen=True)
class LoopQuery:
    """순환 코스 탐색 요청. origin 은 [경도, 위도]."""
    origin: Tuple[float, float]
    target_m: float
    prefs: WalkPreferences
    bearings: Dict[int, float]
    regenerate_nonce: int = 0


@dataclass(frozen=True)
class GraphLoop:
    coords: List[List[float]]
    distance_m: float
    park_attraction: bool = False


Costs = Dict[frozenset, float]


def _prepare_costs(graph: nx.Graph, prefs: WalkPreferences) -> Costs:
    """요청 조건에 맞는 간선 비용을 한 번만 계산한다. 그래프는 여러 요청이 함께 쓰므로 고치지 않는다."""
    return {frozenset((u, v)): edge_cost(data, prefs) for u, v, data in graph.edges(data=True)}


def _weight(costs: Costs, used: Set[frozenset]):
    def weight(u, v, _data):
        key = frozenset((u, v))
        cost = costs[key]
        if math.isinf(cost):
            return None  # 계단 피하기: 간선을 숨긴다
        return cost * REUSE_PENALTY if key in used else cost
    return weight


def _snap(walk: WalkGraph, component: Set[Node], lonlat: Tuple[float, float]) -> Optional[Node]:
    for radius in WAYPOINT_SNAP_M:
        xy = walk.projection.to_xy(lonlat)
        nodes = [n for n in walk.node_grid.within(xy, radius) if n in component]
        if nodes:
            return min(nodes, key=lambda n: haversine_m(lonlat, n))
    return None


def _route_loop(walk: WalkGraph, costs: Costs, stops: Sequence[Node]) -> Optional[List[Node]]:
    """stops 를 차례로 잇는 순환. 앞 구간 간선은 다음 구간에서 비싸진다."""
    used: Set[frozenset] = set()
    path: List[Node] = [stops[0]]
    for a, b in zip(stops, stops[1:]):
        try:
            _cost, leg = nx.bidirectional_dijkstra(walk.graph, a, b, weight=_weight(costs, used))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            return None
        used.update(frozenset(e) for e in zip(leg, leg[1:]))
        path.extend(leg[1:])
    return path


@dataclass(frozen=True)
class _SearchContext:
    walk: WalkGraph
    costs: Costs
    component: Set[Node]
    start: Node


def _loop_for_radius(ctx: _SearchContext, bearing: float, radius_m: float) -> Optional[List[Node]]:
    stops = [ctx.start]
    for offset in (-WAYPOINT_SPREAD_DEG, WAYPOINT_SPREAD_DEG):
        lat, lon = destination_point(ctx.start[1], ctx.start[0], (bearing + offset) % 360.0, radius_m)
        node = _snap(ctx.walk, ctx.component, (lon, lat))
        if node is None or node in stops:
            return None
        stops.append(node)
    stops.append(ctx.start)
    return _route_loop(ctx.walk, ctx.costs, stops)


def _length(nodes: Sequence[Node]) -> float:
    return sum(haversine_m(a, b) for a, b in zip(nodes, nodes[1:]))


def _search(ctx: _SearchContext, bearing: float, target_m: float):
    """경유점 거리를 고쳐 가며 목표 길이에 가장 가까운 유효 순환을 찾는다. (좌표열, 길이) 또는 None."""
    radius = target_m / LOOP_PERIMETER_FACTOR
    best: Optional[Tuple[float, List[List[float]], float]] = None
    for _ in range(MAX_ITERATIONS):
        nodes = _loop_for_radius(ctx, bearing, radius)
        if nodes is None:
            radius *= 0.8
            continue
        coords = collapse_backtracks([[n[0], n[1]] for n in nodes])
        length = _length(coords)
        if length <= 0:
            break
        error = abs(length - target_m) / target_m
        if backtrack_ratio(coords) <= MAX_BACKTRACK and (best is None or error < best[0]):
            best = (error, coords, length)
        if error <= DISTANCE_TOLERANCE:
            break
        radius *= min(SCALE_LIMITS[1], max(SCALE_LIMITS[0], target_m / length))
    return None if best is None else (best[1], best[2])


def _start_node(walk: WalkGraph, origin: Tuple[float, float]) -> Optional[Tuple[Node, Set[Node]]]:
    """출발점 근처에서 충분히 큰 연결 조각에 속한 가장 가까운 노드와 그 조각.

    가까운 노드부터 보되 끊긴 보도 조각(MIN_COMPONENT_NODES 미만)은 건너뛴다.
    큰 조각이 없으면 본 것 중 가장 큰 조각의 가장 가까운 노드를 쓴다.
    """
    xy = walk.projection.to_xy(origin)
    nearby = sorted(set(walk.node_grid.within(xy, START_SNAP_M)), key=lambda n: haversine_m(origin, n))
    whole = walk.graph.number_of_nodes()
    seen: Set[Node] = set()
    fallback: Optional[Tuple[Node, Set[Node]]] = None
    for node in nearby:
        if node in seen:
            continue
        component = nx.node_connected_component(walk.graph, node)
        if len(component) >= min(MIN_COMPONENT_NODES, whole):
            return node, component
        seen |= component
        if fallback is None or len(component) > len(fallback[1]):
            fallback = (node, component)
    return fallback


def _park_bearing(walk: WalkGraph, start: Node, prefs: WalkPreferences) -> Optional[float]:
    """공원 유인: 800m 안의 가장 가까운 공원 쪽 방위. 해당 조건이 꺼져 있거나 공원이 없으면 None."""
    if not (prefs.avoid_traffic or prefs.prefer_quiet or prefs.prefer_soft) or not walk.parks:
        return None
    nearest = [(min(haversine_m(start, n) for n in nodes), nodes) for nodes in walk.parks]
    distance, nodes = min(nearest, key=lambda item: item[0])
    if distance > PARK_ATTRACTION_M:
        return None
    centroid = (sum(n[0] for n in nodes) / len(nodes), sum(n[1] for n in nodes) / len(nodes))
    return bearing_deg(start, centroid)


def plan_preference_loops(walk: WalkGraph, query: LoopQuery) -> Dict[int, GraphLoop]:
    """후보 번호별 순환 코스. 출발점이 보행망에서 멀면 빈 사전."""
    found_start = _start_node(walk, query.origin)
    if found_start is None:
        return {}
    start, component = found_start
    ctx = _SearchContext(walk, _prepare_costs(walk.graph, query.prefs), component, start)
    park_bearing = _park_bearing(walk, start, query.prefs)
    nonce = query.regenerate_nonce
    loops: Dict[int, GraphLoop] = {}
    for variant, base in query.bearings.items():
        rotate = (nonce * 60.0) % 360.0 if nonce > 0 and variant in (2, 3) else 0.0
        use_park = variant == 1 and park_bearing is not None
        bearing = park_bearing if use_park else (base + rotate) % 360.0
        found = _search(ctx, bearing, query.target_m)
        if found is not None:
            loops[variant] = GraphLoop(coords=found[0], distance_m=round(found[1], 1), park_attraction=use_park)
    return loops
