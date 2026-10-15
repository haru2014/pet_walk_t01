"""Deterministic loops on the connected walking graph inside a park boundary."""
import networkx as nx

from agent.park_route_validation import build_park_graph, snap_park_origin, RoutePlanningError
from agent.route_geometry import polyline_length_m


def plan_park_walk(park_id: str, origin_lat: float, origin_lon: float, target_distance_m: float, variant: int) -> list:
    graph = build_park_graph(park_id)
    start = snap_park_origin(graph, (origin_lon, origin_lat))
    component = graph.subgraph(nx.node_connected_component(graph, start))
    distances, paths = nx.single_source_dijkstra(component, start, weight="weight")
    candidates = []
    for cycle in nx.cycle_basis(component, root=start):
        # Approach and return use the shortest path on the same connected graph.
        entry = min(cycle, key=lambda node: distances[node])
        index = cycle.index(entry)
        cycle = cycle[index:] + cycle[:index]
        approach = paths[entry]
        if variant == 2:
            cycle = [entry] + list(reversed(cycle[1:]))
        for repeats in range(1, 5):
            nodes = approach + (cycle[1:] + [entry]) * repeats + list(reversed(approach[:-1]))
            coords = [list(node) for node in nodes]
            length = polyline_length_m(coords)
            if 0 < length <= target_distance_m * 1.25:
                candidates.append((abs(length - target_distance_m), coords))
    if not candidates:
        raise RoutePlanningError("NO_VALID_LOOP", "공원 내부의 연결된 보행로에서 조건에 맞는 순환 경로가 없습니다.")
    candidates.sort(key=lambda item: (item[0], item[1]))
    # Alternative 3 uses the next valid circuit where the graph permits one.
    return candidates[min(1 if variant == 3 else 0, len(candidates) - 1)][1]
