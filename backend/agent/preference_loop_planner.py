"""[US-A3, US-B3, US-20] 환경 조건을 비용으로 반영한 순환 코스 탐색 (현재 위치 모드).

출발점 → 경유점1 → 경유점2 → 출발점 삼각 순환을 OSM 보행 그래프에서 '선호 비용' 최단 경로로 잇는다.
- 간선 비용은 walk_edge_cost.edge_cost (차가 적은 길이면 큰길 옆 보도가 10배 비싸다 등)
- 앞 구간에서 지난 간선은 REUSE_PENALTY 배로 비싸게 해 같은 길 왕복 대신 순환이 되게 한다
- 실측 길이가 목표와 다르면 경유점 거리를 비율로 고쳐 다시 찾는다 (최대 MAX_ITERATIONS 번)
- 후보 중에서는 loop_quality.loop_penalty 가 낮은 것을 고른다 (거리 오차 + 왕복 + 조용한 길 회전 밀도).
  거리 오차만 보던 예전 방식은 왕복이 심한 길을 뽑아 상위 단계에서 통째로 탈락시켰다
- 유인 방위(loop_attraction): 조건이 켜져 있으면 1안은 가까운 공원, 공원이 없고 '쉬어가기 좋은 길'이면
  벤치·정자가 모인 쪽을 바라본다. 공원 안·쉼터 주변 길은 비용이 싸서 순환이 그곳을 지나게 된다
"""

import math
from dataclasses import dataclass, replace
from typing import Dict, List, Optional, Sequence, Set, Tuple

import networkx as nx

from agent.loop_attraction import attraction_for
from agent.loop_quality import loop_penalty
from agent.osm_walk_graph import Node, WalkGraph
from agent.route_geometry import backtrack_ratio, collapse_backtracks, destination_point, haversine_m
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
START_SNAP_M = 150.0
# 쉼터 경유점은 지금 반경으로 닿는 거리일 때만 쓴다. 더 멀면 목표 거리를 크게 넘겨 버린다.
WAYPOINT_REACH_FACTOR = 1.3
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


def _snap(walk: WalkGraph, component: Set[Node], lonlat: Tuple[float, float], avoid_traffic: bool = False) -> Optional[Node]:
    for radius in WAYPOINT_SNAP_M:
        xy = walk.projection.to_xy(lonlat)
        nodes = [n for n in walk.node_grid.within(xy, radius) if n in component]
        if nodes:
            if not avoid_traffic:
                return min(nodes, key=lambda n: haversine_m(lonlat, n))
            def snap_cost(n: Node) -> float:
                d = haversine_m(lonlat, n)
                is_major = any(
                    (walk.graph.get_edge_data(n, nbr) or {}).get("road_context") == "major"
                    for nbr in walk.graph[n]
                )
                return d + (80.0 if is_major else 0.0)
            return min(nodes, key=snap_cost)
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
    prefs: WalkPreferences
    waypoint: Optional[Tuple[float, float]] = None  # 꼭 지나갈 자리 (쉼터 덩어리 중심)


def _first_stop_target(ctx: _SearchContext, bearing: float, radius_m: float) -> Tuple[float, float]:
    """첫 경유점으로 삼을 자리. 쉼터가 이 반경으로 닿는 거리면 그곳을, 아니면 방위각 위의 점을."""
    if ctx.waypoint is not None and haversine_m(ctx.start, ctx.waypoint) <= radius_m * WAYPOINT_REACH_FACTOR:
        return ctx.waypoint
    lat, lon = destination_point(ctx.start[1], ctx.start[0], (bearing - WAYPOINT_SPREAD_DEG) % 360.0, radius_m)
    return (lon, lat)


def _loop_for_radius(ctx: _SearchContext, bearing: float, radius_m: float) -> Optional[List[Node]]:
    lat, lon = destination_point(ctx.start[1], ctx.start[0], (bearing + WAYPOINT_SPREAD_DEG) % 360.0, radius_m)
    stops = [ctx.start]
    for target in (_first_stop_target(ctx, bearing, radius_m), (lon, lat)):
        node = _snap(ctx.walk, ctx.component, target, avoid_traffic=ctx.prefs.avoid_traffic)
        if node is None or node in stops:
            return None
        stops.append(node)
    stops.append(ctx.start)
    return _route_loop(ctx.walk, ctx.costs, stops)


def _length(nodes: Sequence[Node]) -> float:
    return sum(haversine_m(a, b) for a, b in zip(nodes, nodes[1:]))


def _search(ctx: _SearchContext, bearing: float, target_m: float):
    """경유점 거리를 고쳐 가며 가장 쓸 만한 순환을 찾는다. (좌표열, 길이) 또는 None.

    거리 오차뿐 아니라 왕복 비율·회전 밀도까지 합친 벌점(loop_quality)으로 고른다.
    """
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
        penalty = loop_penalty(coords, length, target_m, ctx.prefs)
        if backtrack_ratio(coords) <= MAX_BACKTRACK and (best is None or penalty < best[0]):
            best = (penalty, coords, length)
        if error <= DISTANCE_TOLERANCE and penalty <= DISTANCE_TOLERANCE:
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


def plan_preference_loops(walk: WalkGraph, query: LoopQuery) -> Dict[int, GraphLoop]:
    """후보 번호별 순환 코스. 출발점이 보행망에서 멀면 빈 사전."""
    found_start = _start_node(walk, query.origin)
    if found_start is None:
        return {}
    start, component = found_start
    ctx = _SearchContext(walk, _prepare_costs(walk.graph, query.prefs), component, start, query.prefs)
    attraction = attraction_for(walk, start, query.prefs)
    nonce = query.regenerate_nonce
    loops: Dict[int, GraphLoop] = {}
    for variant, base in query.bearings.items():
        rotate = (nonce * 60.0) % 360.0 if nonce > 0 and variant in (2, 3) else 0.0
        attracted = variant == 1 and attraction is not None
        bearing = attraction.bearing if attracted else (base + rotate) % 360.0
        variant_ctx = replace(ctx, waypoint=attraction.waypoint) if attracted else ctx
        found = _search(variant_ctx, bearing, query.target_m)
        if found is not None:
            loops[variant] = GraphLoop(coords=found[0], distance_m=round(found[1], 1), park_attraction=attracted)
    return loops
