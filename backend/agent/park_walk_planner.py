"""Deterministic loops on the connected walking graph inside a park boundary.

공원 모드 코스 후보 3개는 서로 다른 길이어야 한다 (이슈 #125, #114).
- 1안: 목표 거리에 가장 가까운 순환로
- 2·3안: 앞 후보와 같은 길(간선 겹침 비율이 큰 것)을 제외하고 목표 거리에 가까운 순환로
- 다른 순환로가 부족한 작은 공원은 같은 길의 반대 방향으로 채운다 (방향 표시로 구분된다)
"""
import math

import networkx as nx

from agent.park_route_validation import build_park_graph, resolve_park_start, RoutePlanningError
from agent.route_geometry import polyline_length_m

CANDIDATE_COUNT = 3
SAME_ROUTE_OVERLAP = 0.7  # 간선 겹침(자카드)이 이 값 이상이면 "같은 길"로 보고 고르지 않는다
RELAXED_OVERLAP = 0.9  # 후보가 모자랄 때만 이 값 미만까지 허용한다
MAX_LAP_REPEATS = 4
_CANDIDATE_CACHE: dict = {}
_CANDIDATE_CACHE_MAX = 256


def route_edge_set(coords: list) -> frozenset:
    """좌표열이 지나는 간선의 집합 (방향 무시). 같은 길을 뒤집으면 같은 집합이 된다."""
    points = [tuple(p) for p in coords]
    return frozenset(frozenset((a, b)) for a, b in zip(points, points[1:]) if a != b)


def _overlap(a: frozenset, b: frozenset) -> float:
    union = a | b
    return len(a & b) / len(union) if union else 1.0


def route_direction_label(coords: list) -> str:
    """순환 방향: 좌표열이 둘러싸는 넓이의 부호로 시계/반시계를 정한다 (입구까지 왕복한 길은 상쇄된다)."""
    if len(coords) < 3:
        return "시계 방향"
    lat0 = sum(p[1] for p in coords) / len(coords)
    kx = math.cos(math.radians(lat0))
    area2 = 0.0
    for a, b in zip(coords, coords[1:]):
        area2 += (a[0] * kx) * b[1] - (b[0] * kx) * a[1]
    return "반시계 방향" if area2 > 0 else "시계 방향"


def _compute_candidates(graph: nx.Graph, start: tuple, target_distance_m: float) -> list:
    """조건에 맞는 모든 순환 코스를 (목표와의 거리 차이, 좌표열) 로 모아 정렬한다."""
    component = graph.subgraph(nx.node_connected_component(graph, start))
    distances, paths = nx.single_source_dijkstra(component, start, weight="weight")
    candidates = []
    for cycle in nx.cycle_basis(component, root=start):
        # Approach and return use the shortest path on the same connected graph.
        entry = min(cycle, key=lambda node: distances[node])
        index = cycle.index(entry)
        cycle = cycle[index:] + cycle[:index]
        approach = paths[entry]
        for repeats in range(1, MAX_LAP_REPEATS + 1):
            nodes = approach + (cycle[1:] + [entry]) * repeats + list(reversed(approach[:-1]))
            coords = [list(node) for node in nodes]
            length = polyline_length_m(coords)
            if 0 < length <= target_distance_m * 1.25:
                candidates.append((abs(length - target_distance_m), coords))
    if not candidates:
        raise RoutePlanningError("NO_VALID_LOOP", "공원 내부의 연결된 보행로에서 조건에 맞는 순환 경로가 없습니다.")
    candidates.sort(key=lambda item: (item[0], item[1]))
    return candidates


def _select_distinct(candidates: list) -> list:
    """서로 다른 길 3개를 고른다. 모자라면 덜 엄격한 기준, 그래도 모자라면 반대 방향으로 채운다."""
    chosen: list = []  # [(coords, edge_set)]

    def add_if(max_overlap: float) -> None:
        for _, coords in candidates:
            if len(chosen) == CANDIDATE_COUNT:
                return
            edges = route_edge_set(coords)
            if all(_overlap(edges, other) < max_overlap for _, other in chosen) and not any(coords == c for c, _ in chosen):
                chosen.append((coords, edges))

    add_if(SAME_ROUTE_OVERLAP)
    if len(chosen) < CANDIDATE_COUNT:
        add_if(RELAXED_OVERLAP)
    base = list(chosen)
    for coords, edges in base:  # 같은 길의 반대 방향으로 채운다
        if len(chosen) == CANDIDATE_COUNT:
            break
        reverse = list(reversed(coords))
        if not any(reverse == c for c, _ in chosen):
            chosen.append((reverse, edges))
    while len(chosen) < CANDIDATE_COUNT:  # 최후 수단: 가장 가까운 후보를 다시 쓴다
        chosen.append(chosen[len(chosen) % len(base)] if base else chosen[0])
    return [coords for coords, _ in chosen]


def plan_park_walk_candidates(park_id: str, origin_lat: float, origin_lon: float, target_distance_m: float) -> list:
    """서로 다른 순환 코스 후보 3개 (1안이 목표 거리에 가장 가깝다). 같은 그래프·요청이면 다시 계산하지 않는다."""
    graph = build_park_graph(park_id)
    # 경계 밖 주차장은 저장된 진입로 끝에서 공원 코스를 만들고, 진입로를 앞뒤로 붙인다 (#160).
    # 공원 코스는 목표 거리에 맞추고 진입로 왕복은 더한다 (가 안)
    start, approach = resolve_park_start(graph, park_id, (origin_lon, origin_lat))
    key = (park_id, round(origin_lat, 6), round(origin_lon, 6), round(target_distance_m, 1))
    cached = _CANDIDATE_CACHE.get(key)
    if cached is not None and cached[0] is graph:  # 그래프 객체가 바뀌면(데이터 교체) 다시 계산
        routes = cached[1]
    else:
        routes = _select_distinct(_compute_candidates(graph, start, target_distance_m))
        if len(_CANDIDATE_CACHE) >= _CANDIDATE_CACHE_MAX:
            _CANDIDATE_CACHE.clear()
        _CANDIDATE_CACHE[key] = (graph, routes)
    if approach is not None:
        routes = [approach[:-1] + list(route) + list(reversed(approach))[1:] for route in routes]
    return [[list(point) for point in route] for route in routes]  # 호출한 쪽이 고쳐도 캐시는 그대로


def plan_park_walk(park_id: str, origin_lat: float, origin_lon: float, target_distance_m: float, variant: int) -> list:
    routes = plan_park_walk_candidates(park_id, origin_lat, origin_lon, target_distance_m)
    return routes[max(1, min(int(variant), CANDIDATE_COUNT)) - 1]
