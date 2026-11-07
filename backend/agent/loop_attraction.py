"""[US-20] 순환 코스를 어느 쪽으로 잡을지(유인 방위)를 고른다.

조건을 켜도 방향이 기계적인 방위각(30·150·270도)이면 공원이 바로 옆에 있어도 등지고 갈 수 있다.
그래서 1안은 조건에 맞는 곳을 바라보게 한다.
- 방위(bearing): 폭신한 길·차가 적은 길·조용한 길·쉬어가기 좋은 길 중 하나라도 켜져 있으면 가까운 공원 쪽.
  공원이 없고 '쉬어가기 좋은 길'이면 벤치·정자가 가장 많이 모인 쪽
- 경유점(waypoint): '쉬어가기 좋은 길'일 때만. 쉼터가 모인 자리를 코스가 꼭 지나게 한다.
  방향만 돌려서는 공원 입구만 스치고 벤치까지 가지 않는 일이 있었다

끌 만한 곳이 없으면 None 을 돌려주고 호출자는 기본 방위각을 쓴다.
"""

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

from agent.osm_walk_graph import Node, WalkGraph
from agent.route_geometry import bearing_deg, haversine_m
from services.walk_preferences import WalkPreferences

PARK_ATTRACTION_M = 800.0
REST_ATTRACTION_M = 600.0
REST_CLUSTER_RADIUS_M = 120.0  # 이 거리 안에 모인 쉼터를 한 덩어리로 센다
# 쉼터가 많이 모인 쪽을 먼저 보되, 정자 한 채만 있는 곳도 쉬어 갈 자리이므로 하나부터 센다.
# 같은 수가 모여 있으면 가까운 쪽을 고른다.
MIN_REST_CLUSTER = 1


@dataclass(frozen=True)
class Attraction:
    """1안을 어디로 끌지. waypoint 가 있으면 코스가 그 자리를 지나게 한다 ([경도, 위도])."""
    bearing: float
    waypoint: Optional[Tuple[float, float]] = None


def _centroid(points: Sequence[Sequence[float]]) -> Tuple[float, float]:
    return (sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points))


def _nearest_park_bearing(walk: WalkGraph, start: Node) -> Optional[float]:
    """800m 안에 공원이 있으면 그 중심 쪽 방위."""
    if not walk.parks:
        return None
    nearest = min(((min(haversine_m(start, n) for n in nodes), nodes) for nodes in walk.parks),
                  key=lambda item: item[0])
    if nearest[0] > PARK_ATTRACTION_M:
        return None
    return bearing_deg(start, _centroid(nearest[1]))


def rest_cluster_center(walk: WalkGraph, start: Node) -> Optional[Tuple[float, float]]:
    """600m 안에서 벤치·정자가 가장 많이 모인 덩어리의 중심. 같은 수면 가까운 쪽. 없으면 None."""
    nearby = [point for point in walk.rest_points if haversine_m(start, point) <= REST_ATTRACTION_M]
    if len(nearby) < MIN_REST_CLUSTER:
        return None
    best: Optional[Tuple[int, float, List[Sequence[float]]]] = None
    for seed in nearby:
        group = [point for point in nearby if haversine_m(seed, point) <= REST_CLUSTER_RADIUS_M]
        rank = (len(group), -haversine_m(start, seed))
        if best is None or rank > (best[0], best[1]):
            best = (len(group), -haversine_m(start, seed), group)
    if best is None or best[0] < MIN_REST_CLUSTER:
        return None
    return _centroid(best[2])


def attraction_for(walk: WalkGraph, start: Node, prefs: WalkPreferences) -> Optional[Attraction]:
    """1안을 끌 방위와 (쉬어가기 좋은 길이면) 경유점. 끌 만한 곳이 없으면 None."""
    if not (prefs.prefer_soft or prefs.avoid_traffic or prefs.prefer_quiet or prefs.prefer_rest):
        return None
    rest_center = rest_cluster_center(walk, start) if prefs.prefer_rest else None
    park = _nearest_park_bearing(walk, start)
    if park is not None:
        return Attraction(bearing=park, waypoint=rest_center)
    if rest_center is not None:
        return Attraction(bearing=bearing_deg(start, rest_center), waypoint=rest_center)
    return None
