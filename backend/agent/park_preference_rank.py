"""[US-B1, US-B3] 공원 모드 순환로를 고를 때 환경 조건(폭신한 길·계단 피하기·조용한 길 등)을 반영한다.

공원 보행망(fixtures/park_walk_networks_pilot.json)의 OSM way 태그로 간선 속성을 만들고,
walk_edge_cost.edge_cost 로 '선호 비용 / 길이' 비율을 낸다. 1.0 보다 작을수록 조건에 잘 맞는 순환로다.
목표 시간에 맞는 순환로들 사이에서만 이 비율로 순서를 정한다 (park_walk_planner._compute_candidates).
"""

import math
from functools import lru_cache
from typing import Any, Dict, Optional, Sequence, Tuple

import networkx as nx

from agent.park_route_validation import load_park_networks
from agent.walk_edge_cost import edge_cost, surface_category
from services.walk_preferences import WalkPreferences

# 목표 거리와의 차이가 이 비율 안인 순환로끼리는 조건 적합도로 순서를 정한다
PREFERENCE_DISTANCE_TOLERANCE = 0.15


@lru_cache(maxsize=8)
def _tags_by_way(park_id: str) -> Dict[str, Dict[str, Any]]:
    data = load_park_networks().get(park_id) or {}
    return {str(way.get("way_id")): way.get("tags") or {} for way in data.get("ways", [])}


def _edge_attrs(length: float, tags: Dict[str, Any]) -> Dict[str, Any]:
    highway = tags.get("highway")
    return {
        "length": length,
        "highway": highway,
        "steps": highway == "steps",
        "surface_category": surface_category(tags.get("surface"), highway),
        "surface_tagged": isinstance(tags.get("surface"), str),
        "road_context": "path",
        "in_park": True,
        # 공원 보행망 안에서 자전거 겸용길은 사람이 몰리는 길로 본다 (조용한 길)
        "commercial": highway == "cycleway",
    }


def cycle_preference_ratio(graph: nx.Graph, park_id: str, nodes: Sequence[Tuple[float, float]],
                           prefs: Optional[WalkPreferences]) -> float:
    """순환로(끝점 반복 없는 노드 목록)의 선호 비용 / 길이. 조건이 없으면 1.0, 계단을 피해야 하는데 있으면 무한대."""
    if prefs is None or not prefs.shapes_route:
        return 1.0
    tags = _tags_by_way(park_id)
    total = cost = 0.0
    for a, b in zip(nodes, list(nodes[1:]) + [nodes[0]]):
        data = graph.get_edge_data(a, b) or {}
        length = float(data.get("weight", 0.0))
        if length <= 0:
            continue
        edge = edge_cost(_edge_attrs(length, tags.get(str(data.get("way_id")), {})), prefs)
        if math.isinf(edge):
            return math.inf
        total += length
        cost += edge
    return cost / total if total else 1.0


def ranking_key(diff: float, target_m: float, preference_ratio: float) -> Tuple[bool, float, float]:
    """(목표 밖인가, 목표 안이면 선호 비율, 목표와의 차이). 조건이 없으면 비율이 모두 1.0 이라 예전 순서와 같다."""
    if math.isinf(preference_ratio):  # 계단 피하기를 골랐는데 계단이 있는 순환로는 맨 뒤로
        return True, math.inf, diff
    outside = diff > target_m * PREFERENCE_DISTANCE_TOLERANCE
    return outside, (0.0 if outside else preference_ratio), diff


def preferences_signature(prefs: Optional[WalkPreferences]) -> Tuple[bool, ...]:
    """후보 캐시 키에 넣는 조건 서명."""
    if prefs is None:
        return ()
    return tuple(prefs.model_dump().values())
