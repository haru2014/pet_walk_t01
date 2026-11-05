"""[US-B1, US-B3, US-20] 보행 간선 비용 모델: 앱 환경 조건을 '어느 길을 고를지'에 반영한다.

비용(m 환산) = 길이 × 노면 배수 × 차도 배수 × 조용함 배수 × 그늘 배수 × 쉼터 배수 × 공원 배수 + 횡단 비용
- 계단 피하기: 계단 간선은 무한대 비용(하드 제약, docs/04 · US-B1)
- 노면 계수: .gemini/coding_rule.md 3.1 (잔디·흙 0.6, 탄성 0.7, 포장 1.0, 아스팔트 2.5, 자갈 3.5, 선호 할인 0.45)
- 꺼진 조건은 배수 1.0 이라 기본 경로(최단 거리)와 같다
"""

import math
from typing import Any, Dict, Mapping

from services.walk_preferences import WalkPreferences

MAJOR_ROADS = {"motorway", "trunk", "primary", "secondary", "tertiary",
               "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
MINOR_ROADS = {"residential", "unclassified", "service", "living_street", "road"}

# 노면 기본 가중치 (coding_rule 3.1). 선호 노면은 PREF_DISCOUNT_FACTOR 를 더 곱한다.
SURFACE_BASE_WEIGHTS: Dict[str, float] = {
    "grass": 0.6, "dirt": 0.6, "rubber": 0.7, "paved": 1.0, "asphalt": 2.5, "gravel": 3.5,
}
PREF_DISCOUNT_FACTOR = 0.45
# OSM surface 값 → 위 범주
SURFACE_CATEGORY: Dict[str, str] = {
    "grass": "grass", "grass_paver": "grass",
    "dirt": "dirt", "earth": "dirt", "ground": "dirt", "unpaved": "dirt", "compacted": "dirt",
    "fine_gravel": "dirt", "woodchips": "dirt", "wood": "dirt", "sand": "dirt", "mud": "dirt",
    "tartan": "rubber", "rubber": "rubber", "artificial_turf": "rubber",
    "paved": "paved", "paving_stones": "paved", "concrete": "paved", "concrete:plates": "paved",
    "sett": "paved", "bricks": "paved", "metal": "paved",
    "asphalt": "asphalt", "chipseal": "asphalt",
    "gravel": "gravel", "pebblestone": "gravel", "rock": "gravel",
}
SOFT_CATEGORIES = {"grass", "dirt", "rubber"}
# 노면 태그가 없을 때 길 종류로 짐작하는 범주 (결측 Fallback). 짐작이므로 할인은 주지 않는다.
HIGHWAY_SURFACE_FALLBACK: Dict[str, str] = {"track": "dirt", "path": "paved"}

# 차가 적은 길: 길 맥락별 배수와 횡단 1회 비용(m 환산)
TRAFFIC_MULTIPLIER = {"path": 0.8, "minor": 1.6, "major": 4.0}
CROSSING_COST_M = 60.0
MAJOR_CROSSING_EXTRA_M = 90.0
# 조용한 길 (US-20): 큰길·상업지·광장은 비싸게, 공원 둘레길·넓은 길은 싸게
QUIET_MULTIPLIER = {"path": 0.85, "minor": 1.3, "major": 3.0}
QUIET_COMMERCIAL = 1.8
QUIET_PLAZA = 1.5
QUIET_WIDE_PATH = 0.9
WIDE_PATH_M = 3.0
SHADE_MULTIPLIER = 0.7
REST_MULTIPLIER = 0.85
PARK_MULTIPLIER = 0.8
MIN_MULTIPLIER = 0.2


def surface_category(surface: Any, highway: Any) -> str:
    """OSM surface(없으면 길 종류)로 노면 범주. 모르면 'unknown'."""
    if isinstance(surface, str) and surface in SURFACE_CATEGORY:
        return SURFACE_CATEGORY[surface]
    return HIGHWAY_SURFACE_FALLBACK.get(highway, "unknown")


def surface_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not prefs.prefer_soft:
        return 1.0
    category = attrs.get("surface_category", "unknown")
    weight = SURFACE_BASE_WEIGHTS.get(category, 1.0)
    has_tag = attrs.get("surface_tagged", False)
    if category in SOFT_CATEGORIES and has_tag:
        weight *= PREF_DISCOUNT_FACTOR
    return weight


def _traffic_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not prefs.avoid_traffic:
        return 1.0
    return TRAFFIC_MULTIPLIER.get(attrs.get("road_context", "minor"), 1.0)


def _quiet_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not prefs.prefer_quiet:
        return 1.0
    value = QUIET_MULTIPLIER.get(attrs.get("road_context", "minor"), 1.0)
    if attrs.get("commercial"):
        value *= QUIET_COMMERCIAL
    if attrs.get("highway") == "pedestrian":
        value *= QUIET_PLAZA
    if (attrs.get("width_m") or 0.0) >= WIDE_PATH_M:
        value *= QUIET_WIDE_PATH
    return value


def _context_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    value = 1.0
    if prefs.prefer_shade and attrs.get("shaded"):
        value *= SHADE_MULTIPLIER
    if prefs.prefer_rest and attrs.get("near_rest"):
        value *= REST_MULTIPLIER
    if attrs.get("in_park") and (prefs.prefer_soft or prefs.avoid_traffic or prefs.prefer_quiet):
        value *= PARK_MULTIPLIER
    return value


def crossing_cost_m(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not (prefs.avoid_traffic or prefs.prefer_quiet) or not attrs.get("crossing"):
        return 0.0
    extra = MAJOR_CROSSING_EXTRA_M if attrs.get("crossing_major") else 0.0
    return CROSSING_COST_M + extra


def edge_cost(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    """간선 하나의 탐색 비용. 계단 피하기가 켜진 계단 간선은 무한대."""
    if prefs.avoid_stairs and attrs.get("steps"):
        return math.inf
    multiplier = (surface_multiplier(attrs, prefs) * _traffic_multiplier(attrs, prefs)
                  * _quiet_multiplier(attrs, prefs) * _context_multiplier(attrs, prefs))
    return float(attrs["length"]) * max(MIN_MULTIPLIER, multiplier) + crossing_cost_m(attrs, prefs)
