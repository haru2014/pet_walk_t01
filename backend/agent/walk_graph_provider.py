"""출발지·경로 주변 OSM 보행 그래프를 한곳에서 만들어 나눠 쓴다 (같은 지역은 다시 만들지 않는다).

그래프는 만든 뒤 읽기만 한다. 요청별 선호 비용은 preference_loop_planner 가 따로 계산한다.
"""

import threading
from typing import Dict, Optional, Sequence, Tuple

from agent.osm_overpass_client import OsmRegion, fetch_region, region_radius_m
from agent.osm_walk_graph import WalkGraph, build_walk_graph
from agent.route_barriers import BarrierIndex
from agent.route_geometry import haversine_m

MAX_RADIUS_M = 1800.0
ROUTE_MARGIN_M = 100.0

_GRAPHS: Dict[int, Tuple[OsmRegion, Optional[WalkGraph]]] = {}
_LOCK = threading.Lock()


def _graph_for_region(region: Optional[OsmRegion]) -> Optional[WalkGraph]:
    if region is None:
        return None
    with _LOCK:
        cached = _GRAPHS.get(id(region))
        if cached is not None and cached[0] is region:
            return cached[1]
        walk = build_walk_graph(region)
        if len(_GRAPHS) >= 32:
            _GRAPHS.clear()
        _GRAPHS[id(region)] = (region, walk)
        return walk


def walk_graph_for_loop(lat: float, lon: float, target_distance_m: float,
                        budget_s: Optional[float] = None) -> Optional[WalkGraph]:
    """출발지 중심, 목표 순환 거리가 들어가는 반경의 보행 그래프. 받지 못하면 None.

    budget_s 는 OSM 자료 조회에 쓸 수 있는 시간이다 (services/request_budget.py).
    """
    return _graph_for_region(fetch_region(lat, lon, region_radius_m(target_distance_m), budget_s))


def walk_graph_for_coords(coords: Sequence[Sequence[float]],
                          budget_s: Optional[float] = None) -> Optional[WalkGraph]:
    """경로 전체를 덮는 보행 그래프 (공원 코스 등 이미 만든 경로의 지표를 잴 때)."""
    if len(coords) < 2:
        return None
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    center = ((min(lons) + max(lons)) / 2, (min(lats) + max(lats)) / 2)
    radius = max(haversine_m(center, c) for c in coords) + ROUTE_MARGIN_M
    if radius > MAX_RADIUS_M:
        return None
    return _graph_for_region(fetch_region(center[1], center[0], max(radius, 600.0), budget_s))


def barriers_for_loop(lat: float, lon: float, target_distance_m: float,
                      budget_s: Optional[float] = None) -> Optional[BarrierIndex]:
    """출발지 주변 물길·철로 색인. 자료를 못 받았으면 None (= 확인할 수 없다)."""
    walk = walk_graph_for_loop(lat, lon, target_distance_m, budget_s)
    return None if walk is None else walk.barriers


def route_is_passable(coords: Sequence[Sequence[float]], barriers: Optional[BarrierIndex]) -> bool:
    """경로가 다리 없이 물길·철로를 건너지 않는지. 확인할 자료가 없으면 True (막지 않는다).

    자료가 없어 확인하지 못한 경우에는 호출자가 사용자에게 대체 경로임을 알린다(GEMINI.md 원칙 8).
    """
    if barriers is None or not barriers:
        return True
    return not barriers.crosses(coords)
