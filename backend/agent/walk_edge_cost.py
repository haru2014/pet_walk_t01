"""[US-B1, US-B3, US-20] 보행 간선 비용 모델: 앱 환경 조건을 '어느 길을 고를지'에 반영한다.

비용(m 환산) = 길이 × 노면 배수 × 차도 배수 × 조용함 배수 × 그늘 배수 × 쉼터 배수 × 공원 배수
              + 횡단 비용 + 교차로 비용
- 계단 피하기: 계단 간선은 무한대 비용(하드 제약, docs/04 · US-B1)
- 노면 계수: .gemini/coding_rule.md 3.1 (잔디·흙 0.6, 탄성 0.7, 포장 1.0, 아스팔트 2.5, 자갈 3.5, 선호 할인 0.45)
- 꺼진 조건은 배수 1.0, 추가 비용 0 이라 기본 경로(최단 거리)와 같다

세 조건이 노리는 길 (앱 문구 ↔ 비용):
- 차가 적은 길: 큰길·그 옆 보도를 비싸게 하고, 차도에서 멀어질수록 깎아 준다 → 도로와 먼 인도·보행 전용로
- 조용한 길: 큰길·상업지·광장에 더해 번잡한 교차로와 횡단을 비싸게 한다 → 복잡하지 않은 경로
- 쉬어가기 좋은 길: 공원 안과 벤치·정자 주변을 깎아 준다 → 쉼터가 있는 경로
"""

import math
from typing import Any, Dict, Mapping, Optional

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
TRAFFIC_MULTIPLIER = {"path": 0.8, "minor": 1.6, "major": 10.0}
CROSSING_COST_M = 60.0
MAJOR_CROSSING_EXTRA_M = 150.0
# 차가 적은 길 거리 기울기: 차도에서 멀어질수록 배수를 깎아 준다.
#   road_context 는 큰길 25m·골목 8m 라는 이진 판정이라, 간선도로 36m 옆 보도와 공원 산책로가 똑같이 'path' 가 된다.
#   그래서 차도까지의 실제 거리로 한 번 더 깎아 "도로와 먼 인도" 가 실제로 더 싸지게 한다.
#   큰길 위·큰길 옆(major)은 깎지 않는다 (1.0) — 차도에서 25m 안이라 '멀다'고 할 수 없다.
TRAFFIC_DISTANCE_RELIEF = {"path": 0.5, "minor": 0.65, "major": 1.0}
TRAFFIC_RELIEF_FROM_M = 25.0   # 이 거리까지는 깎지 않는다 (osm_walk_graph.MAJOR_NEAR_M 과 같은 값)
TRAFFIC_RELIEF_FULL_M = 120.0  # 이만큼 떨어지면 깎을 수 있는 만큼 모두 깎는다
# 조용한 길 (US-20): 큰길·상업지·광장은 비싸게, 공원 둘레길·넓은 길은 싸게
QUIET_MULTIPLIER = {"path": 0.85, "minor": 1.3, "major": 3.0}
QUIET_COMMERCIAL = 1.8
QUIET_PLAZA = 1.5
QUIET_WIDE_PATH = 0.9
WIDE_PATH_M = 3.0
# 조용한 길 복잡도: 분기가 많은 교차로를 지날 때마다 비용을 더한다 (갈림길이 잦은 격자길보다 이어진 길을 고르게)
QUIET_JUNCTION_DEGREE = 4
QUIET_JUNCTION_COST_M = 25.0
SHADE_MULTIPLIER = 0.7
# 쉬어가기 좋은 길: 벤치·정자 옆은 많이, 조금 떨어진 곳은 조금 깎아 준다
REST_MULTIPLIER = 0.7
REST_NEAR_M = 30.0
REST_REACH_M = 120.0
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


def _ramp(value: Optional[float], start_m: float, full_m: float) -> float:
    """start_m 에서 0, full_m 에서 1 로 올라가는 비율. value 가 None 이면 '아주 멀다'로 보고 1."""
    if value is None:
        return 1.0
    return min(1.0, max(0.0, (value - start_m) / (full_m - start_m)))


def traffic_distance_relief(attrs: Mapping[str, Any]) -> float:
    """차도에서 떨어진 만큼 깎아 주는 비율 (1.0 = 안 깎음). 'road_distance_m' 가 없는 간선은 안 깎는다."""
    context = attrs.get("road_context", "minor")
    floor = TRAFFIC_DISTANCE_RELIEF.get(context, 1.0)
    if floor >= 1.0 or "road_distance_m" not in attrs:
        return 1.0
    reach = _ramp(attrs.get("road_distance_m"), TRAFFIC_RELIEF_FROM_M, TRAFFIC_RELIEF_FULL_M)
    return 1.0 - (1.0 - floor) * reach


def _traffic_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not prefs.avoid_traffic:
        return 1.0
    base = TRAFFIC_MULTIPLIER.get(attrs.get("road_context", "minor"), 1.0)
    return base * traffic_distance_relief(attrs)


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


def _rest_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    """벤치·정자에 가까울수록 싸게. 30m 안은 REST_MULTIPLIER, 120m 밖은 1.0."""
    if not prefs.prefer_rest:
        return 1.0
    if "rest_distance_m" not in attrs:
        return REST_MULTIPLIER if attrs.get("near_rest") else 1.0
    far = _ramp(attrs.get("rest_distance_m"), REST_NEAR_M, REST_REACH_M)
    return REST_MULTIPLIER + (1.0 - REST_MULTIPLIER) * far


def _wants_park(prefs: WalkPreferences) -> bool:
    """공원 안 길을 싸게 볼 조건. '쉬어가기 좋은 길'도 공원을 노린다 (벤치·정자가 공원에 모여 있다)."""
    return prefs.prefer_soft or prefs.avoid_traffic or prefs.prefer_quiet or prefs.prefer_rest


def _context_multiplier(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    value = _rest_multiplier(attrs, prefs)
    if prefs.prefer_shade and attrs.get("shaded"):
        value *= SHADE_MULTIPLIER
    if attrs.get("in_park") and _wants_park(prefs):
        value *= PARK_MULTIPLIER
    return value


def crossing_cost_m(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    if not (prefs.avoid_traffic or prefs.prefer_quiet) or not attrs.get("crossing"):
        return 0.0
    extra = MAJOR_CROSSING_EXTRA_M if attrs.get("crossing_major") else 0.0
    return CROSSING_COST_M + extra


def junction_cost_m(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    """조용한 길: 분기 4개 이상인 교차로에 붙은 간선마다 더하는 비용. 갈림길이 잦은 길을 피하게 한다."""
    if not prefs.prefer_quiet:
        return 0.0
    degree = attrs.get("junction_degree") or 0
    return QUIET_JUNCTION_COST_M if degree >= QUIET_JUNCTION_DEGREE else 0.0


def edge_cost(attrs: Mapping[str, Any], prefs: WalkPreferences) -> float:
    """간선 하나의 탐색 비용. 계단 피하기가 켜진 계단 간선은 무한대."""
    if prefs.avoid_stairs and attrs.get("steps"):
        return math.inf
    multiplier = (surface_multiplier(attrs, prefs) * _traffic_multiplier(attrs, prefs)
                  * _quiet_multiplier(attrs, prefs) * _context_multiplier(attrs, prefs))
    extra = crossing_cost_m(attrs, prefs) + junction_cost_m(attrs, prefs)
    return float(attrs["length"]) * max(MIN_MULTIPLIER, multiplier) + extra
