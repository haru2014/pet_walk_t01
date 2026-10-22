"""Deterministic loops on the connected walking graph inside a park boundary.

공원 모드 코스 후보 3개는 서로 다른 길이어야 한다 (이슈 #125, #114).
- 1안: 목표 거리에 가장 가까운 순환로
- 2·3안: 앞 후보와 같은 길(간선 겹침 비율이 큰 것)을 제외하고 목표 거리에 가까운 순환로
- 다른 순환로가 부족한 작은 공원은 같은 길의 반대 방향으로 채운다 (방향 표시로 구분된다)
"""
import math

import networkx as nx
from shapely.geometry import LineString

from agent.park_route_validation import build_park_graph, resolve_park_start, RoutePlanningError
from agent.route_geometry import polyline_length_m

CANDIDATE_COUNT = 3
SAME_ROUTE_OVERLAP = 0.65  # 간선 겹침(자카드 또는 포함률)이 이 값 이상이면 "같은 길"로 보고 고르지 않는다
RELAXED_OVERLAP = 0.85  # 후보가 모자랄 때만 이 값 미만까지 허용한다
MAX_LAP_REPEATS = 4
SAME_PATH_TOLERANCE_M = 20.0  # 두 코스의 선이 이 거리 안에 붙어 있으면 같은 길로 본다 (나란한 보행로·잘게 쪼개진 간선 대비)
_CANDIDATE_CACHE: dict = {}
_CANDIDATE_CACHE_MAX = 256
# cycle_basis 는 그래프의 "기본 순환"만 준다(송강 11개, 가장 긴 것 410m). 공원 바깥쪽을 크게 도는 길은
# 기본 순환들을 합친 모양이라 후보에 들어오지 않아, 작은 공원은 공원 일부만 도는 짧은 코스가 나왔다.
# 갈림길끼리 잇는 구간 그래프에서 단순 순환을 더 찾는다 (송강 591개 전부, 가장 긴 것 699m).
# 큰 공원은 순환 수가 폭발하므로 개수 상한까지만 찾는다 (기본 순환은 그대로 후보에 남는다).
EXTRA_CYCLE_LIMIT = 3000
_CYCLE_CACHE: dict = {}


def route_edge_set(coords: list) -> frozenset:
    """좌표열이 지나는 간선의 집합 (방향 무시). 같은 길을 뒤집으면 같은 집합이 된다."""
    points = [tuple(p) for p in coords]
    return frozenset(frozenset((a, b)) for a, b in zip(points, points[1:]) if a != b)


def _overlap(a: frozenset, b: frozenset) -> float:
    """간선 겹침 비율.

    두 경로 중 어느 한쪽이라도 대부분(containment) 겹치거나,
    전체 자카드 유사도가 높으면 같은 길로 판단한다.
    """
    if not a or not b:
        return 1.0
    inter = len(a & b)
    if inter == 0:
        return 0.0
    jaccard = inter / len(a | b)
    containment = inter / min(len(a), len(b))
    return max(jaccard, containment)


def _shape(coords: list) -> LineString:
    """미터 단위로 편 선. 위도에 따른 경도 길이 차이를 맞춘다."""
    kx = 111320.0 * math.cos(math.radians(coords[0][1]))
    return LineString([(lon * kx, lat * 110540.0) for lon, lat in coords])


def spatial_overlap(a: LineString, b: LineString) -> float:
    """한 코스가 다른 코스에서 SAME_PATH_TOLERANCE_M 이내에 있는 비율 (둘 중 큰 쪽)."""
    if a.length == 0 or b.length == 0:
        return 1.0
    return max(
        a.intersection(b.buffer(SAME_PATH_TOLERANCE_M)).length / a.length,
        b.intersection(a.buffer(SAME_PATH_TOLERANCE_M)).length / b.length,
    )


def routes_overlap(coords_a: list, coords_b: list) -> float:
    """실제 지도 위에서 두 코스가 겹치는 비율.

    간선 겹침만 보면 같은 길을 조금씩 다른 점으로 이은 코스가 서로 다른 길로 보인다
    (유림 20분: 간선 겹침 0.55~0.61 인데 지도에서는 83~94% 겹침).
    """
    return spatial_overlap(_shape(coords_a), _shape(coords_b))


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


def _junction_segments(graph: nx.Graph) -> dict:
    """갈림길(차수 2가 아닌 점)끼리 잇는 구간. {frozenset(갈림길 쌍): (길이, 점 목록)} — 같은 쌍은 짧은 구간만 남긴다."""
    junctions = {node for node in graph if graph.degree(node) != 2}
    segments: dict = {}
    for u in junctions:
        for v in graph.neighbors(u):
            path = [u, v]
            while path[-1] not in junctions:
                path.append(next(w for w in graph.neighbors(path[-1]) if w != path[-2]))
            end = path[-1]
            if end == u:  # 한 갈림길로 되돌아오는 고리는 기본 순환이 이미 다룬다
                continue
            length = sum(graph[a][b]["weight"] for a, b in zip(path, path[1:]))
            key = frozenset((u, end))
            if key not in segments or length < segments[key][0]:
                segments[key] = (length, path, frozenset(frozenset(edge) for edge in zip(path, path[1:])))
    return segments


def _extra_cycles(component: nx.Graph) -> list:
    """구간 그래프의 단순 순환 [(점 목록, 길이, 간선 집합)]. 점 목록은 cycle_basis 와 같은 형식(끝점 반복 없음).

    길이·간선 집합은 구간별로 미리 계산한 값을 합친다 (점마다 다시 계산하면 도안은 첫 계산이 10초 걸렸다).
    """
    segments = _junction_segments(component)
    junction_graph = nx.Graph()
    junction_graph.add_edges_from(tuple(key) for key in segments)
    cycles = []
    for junction_cycle in nx.simple_cycles(junction_graph):
        if len(junction_cycle) < 3:
            continue
        nodes = [junction_cycle[0]]
        parts = [segments[frozenset(pair)] for pair in zip(junction_cycle, junction_cycle[1:] + junction_cycle[:1])]
        for a, (_, path, _) in zip(junction_cycle, parts):
            nodes.extend((path if path[0] == a else path[::-1])[1:])
        cycles.append((nodes[:-1], sum(part[0] for part in parts), frozenset().union(*(part[2] for part in parts))))
        if len(cycles) >= EXTRA_CYCLE_LIMIT:
            break
    return cycles


def _cycle_edges(cycle: list) -> frozenset:
    return frozenset(frozenset(edge) for edge in zip(cycle, cycle[1:] + cycle[:1]))


def _cycle_length(component: nx.Graph, cycle: list) -> float:
    return sum(component[a][b]["weight"] for a, b in zip(cycle, cycle[1:] + cycle[:1]))


def _cached_extra_cycles(graph: nx.Graph, component_nodes: frozenset) -> list:
    """출발점과 무관한 추가 순환 [(점 목록, 길이, 간선 집합)]. 같은 그래프·연결 조각이면 다시 계산하지 않는다."""
    key = (id(graph), component_nodes)
    cached = _CYCLE_CACHE.get(key)
    if cached is not None and cached[0] is graph:
        return cached[1]
    cycles = _extra_cycles(graph.subgraph(component_nodes))
    if len(_CYCLE_CACHE) >= 64:
        _CYCLE_CACHE.clear()
    _CYCLE_CACHE[key] = (graph, cycles)
    return cycles


def warm_park_cycles(graph: nx.Graph) -> int:
    """서버 시작 워밍업용: 연결 조각마다 추가 순환을 미리 찾아 캐시에 넣는다. 찾은 순환 수를 돌려준다."""
    return sum(len(_cached_extra_cycles(graph, frozenset(nodes))) for nodes in nx.connected_components(graph))


def _compute_candidates(graph: nx.Graph, start: tuple, target_distance_m: float) -> list:
    """조건에 맞는 순환 코스를 목표 거리에 가까운 순으로 모은다.

    각 후보는 (목표와의 거리 차이, 간선 집합, 좌표열을 만드는 함수). 좌표열은 고른 후보만 만든다
    (큰 공원은 후보가 수천 개라 미리 다 만들면 요청 1번에 수 초가 걸린다).
    """
    component_nodes = frozenset(nx.node_connected_component(graph, start))
    component = graph.subgraph(component_nodes)
    distances, paths = nx.single_source_dijkstra(component, start, weight="weight")
    basis = [(c, _cycle_length(graph, c), _cycle_edges(c)) for c in nx.cycle_basis(component, root=start)]
    cycles = []
    seen = set()
    for cycle, cycle_length, signature in basis + _cached_extra_cycles(graph, component_nodes):
        if signature not in seen:
            seen.add(signature)
            cycles.append((cycle, cycle_length, signature))
    scored = []
    for index, (cycle, cycle_length, _) in enumerate(cycles):
        # Approach and return use the shortest path on the same connected graph.
        entry = min(cycle, key=distances.__getitem__)
        # 같은 순환의 바퀴 수만 다른 코스는 사실상 같은 길이므로, 목표에 가장 가까운 바퀴 수 하나만 남긴다.
        options = [
            (abs(length - target_distance_m), repeats)
            for repeats in range(1, MAX_LAP_REPEATS + 1)
            if 0 < (length := 2 * distances[entry] + repeats * cycle_length) <= target_distance_m * 1.25
        ]
        if options:
            diff, repeats = min(options)
            scored.append((diff, index, repeats, entry))
    if not scored:
        raise RoutePlanningError("NO_VALID_LOOP", "공원 내부의 연결된 보행로에서 조건에 맞는 순환 경로가 없습니다.")
    scored.sort(key=lambda item: item[:3])

    def builder(index: int, repeats: int, entry: tuple):
        def build() -> list:
            cycle = cycles[index][0]
            position = cycle.index(entry)
            cycle = cycle[position:] + cycle[:position]
            approach = paths[entry]
            nodes = approach + (cycle[1:] + [entry]) * repeats + list(reversed(approach[:-1]))
            return [list(node) for node in nodes]
        return build

    approach_edges: dict = {}
    candidates = []
    for diff, index, repeats, entry in scored:
        if entry not in approach_edges:  # route_edge_set 과 같은 모양: 방향 없는 간선의 집합
            approach_edges[entry] = frozenset(frozenset(edge) for edge in zip(paths[entry], paths[entry][1:]))
        candidates.append((diff, cycles[index][2] | approach_edges[entry], builder(index, repeats, entry)))
    return candidates


def _select_distinct(candidates: list) -> list:
    """서로 다른 길 3개를 고른다. 모자라면 덜 엄격한 기준, 그래도 모자라면 반대 방향으로 채운다."""
    chosen: list = []  # [(coords, edge_set, shape)]

    def add_if(max_overlap: float) -> None:
        for _, edges, build in candidates:
            if len(chosen) == CANDIDATE_COUNT:
                return
            if all(_overlap(edges, other) < max_overlap for _, other, _ in chosen):
                coords = build()
                if any(coords == c for c, _, _ in chosen):
                    continue
                shape = _shape(coords)
                if all(spatial_overlap(shape, other) < max_overlap for _, _, other in chosen):
                    chosen.append((coords, edges, shape))

    add_if(SAME_ROUTE_OVERLAP)
    if len(chosen) < CANDIDATE_COUNT:
        add_if(RELAXED_OVERLAP)
    base = list(chosen)
    for coords, edges, shape in base:  # 같은 길의 반대 방향으로 채운다
        if len(chosen) == CANDIDATE_COUNT:
            break
        reverse = list(reversed(coords))
        if not any(reverse == c for c, _, _ in chosen):
            chosen.append((reverse, edges, shape))
    while len(chosen) < CANDIDATE_COUNT:  # 최후 수단: 가장 가까운 후보를 다시 쓴다
        chosen.append(chosen[len(chosen) % len(base)] if base else chosen[0])
    return [coords for coords, _, _ in chosen]


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
