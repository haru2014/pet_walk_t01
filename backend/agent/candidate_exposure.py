"""[US-B3, US-20] 후보 코스마다 차도 인접 비율·횡단 수·쉼터 수를 잰다 (채점과 카드 안내의 근거).

- 현재 위치 모드: 코스를 찾을 때 받은 출발지 주변 OSM 그래프를 그대로 쓴다 (캐시)
- 공원 모드: 차가 적은 길·조용한 길·쉬어가기 좋은 길을 골랐을 때만 코스 주변 OSM 자료를 받는다
그래프가 없으면 모든 값이 None 이다 (services/route_exposure.EMPTY).
"""

from typing import Any, Dict, List, Mapping

from agent.walk_graph_provider import walk_graph_for_coords, walk_graph_for_loop
from services.route_exposure import EMPTY, measure_route_exposure
from services.walk_preferences import WalkPreferences

PARK_MODES = ("park", "parking_pnr")
EXPOSURE_FIELDS = tuple(EMPTY.keys())


def candidate_exposures(
    state: Mapping[str, Any],
    target_distance_m: float,
    coords_by_id: Mapping[str, List[List[float]]],
) -> Dict[str, Dict[str, Any]]:
    """{route_id: 실측 지표}. state 는 에이전트 상태(출발 모드·좌표·정리된 의도)."""
    prefs = WalkPreferences.from_intent(state.get("parsed_intent") or {})
    if (state.get("origin_mode") or "current_location") in PARK_MODES:
        if not prefs.needs_road_context:
            return {route_id: dict(EMPTY) for route_id in coords_by_id}
        all_coords = [point for coords in coords_by_id.values() for point in coords]
        walk = walk_graph_for_coords(all_coords)
    else:
        walk = walk_graph_for_loop(state.get("origin_lat", 37.5665), state.get("origin_lon", 126.9780), target_distance_m)
    return {route_id: measure_route_exposure(coords, walk) for route_id, coords in coords_by_id.items()}


def is_preference_routed(route_source: str) -> bool:
    """환경 조건을 비용으로 반영해 찾은 코스인지 (OSM 그래프 또는 공원 보행망)."""
    return route_source.startswith(("osm_graph", "park_graph_"))
