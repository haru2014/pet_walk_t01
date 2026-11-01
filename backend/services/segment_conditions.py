"""[US-B1, US-B2, #158] 지도 구간(링크)별 진행 방향 경사·노면·그늘·추정 지면온도.

앱 지도(PR #233)는 구간마다 `slopeSignedPercent`(오르막 +, 내리막 −)와 `surfaceTempC`를 받아
경사 화살표와 지면온도 색을 그린다. 실제로 잴 수 있는 값만 내고, 모르면 None 이다.

- 경사: DEM 이 켜져 있을 때만 (꺼져 있으면 근사식이라 방향에 근거가 없어 None)
- 노면: 공원 경로의 공원 보행망 OSM surface 태그. 공원 밖·태그 없음은 None
- 그늘: 공원 경로만 위성 토지피복(나무 10m 안 비율). 도안·공원 밖은 None (route_profile 과 같은 기준)
- 지면온도: 노면을 알고 현재 기온·일사 가중치가 있을 때만. 노면별 상승폭(weather_context)으로 구하고,
  그늘을 알면 맞춤 점수와 같은 비율(SHADE_COOLING)로 식힌다. 그늘을 모르면 식히지 않는다(보수적).
"""

from typing import Any, Dict, List, Optional, Sequence

from agent.personalized_scorer import cooled_surface_temp
from agent.route_geometry import haversine_m
from agent.surface_slope_evaluator import calculate_segment_signed_slope_percent
from services.dem import elevation_source
from services.landcover import near_tree_ratio
from services.route_profile import SHADE_UNSUPPORTED_PARKS, _edge_tags
from services.weather_context import calculate_surface_temps

# OSM surface 태그 → 지면온도 상승폭 분류(weather_context.SURFACE_HEAT_GAIN_MAP 의 키)
OSM_SURFACE_TO_HEAT_CLASS = {
    "asphalt": "asphalt",
    "concrete": "paved", "concrete:plates": "paved", "concrete:lanes": "paved", "paving_stones": "paved",
    "sett": "paved", "cobblestone": "paved", "unhewn_cobblestone": "paved", "paved": "paved",
    "metal": "paved", "wood": "paved", "bricks": "paved",
    "tartan": "rubber", "rubber": "rubber", "artificial_turf": "rubber",
    "dirt": "dirt", "earth": "dirt", "ground": "dirt", "compacted": "dirt", "mud": "dirt",
    "sand": "dirt", "woodchips": "dirt", "unpaved": "dirt",
    "grass": "grass", "grass_paver": "grass",
    "gravel": "gravel", "fine_gravel": "gravel", "pebblestone": "gravel",
}


def _current_weather(weather_context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not isinstance(weather_context, dict):
        return {}
    current = weather_context.get("current")
    return current if isinstance(current, dict) else weather_context


def link_conditions(coords: Sequence[Sequence[float]], park_id: Optional[str] = None,
                    weather_context: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    """좌표열의 이웃한 두 점(링크)마다 {slope_signed, surface, shade, temp, length} 를 돌려준다."""
    points = [tuple(p) for p in coords]
    dem_on = elevation_source() is not None
    tags = _edge_tags(park_id) if park_id else {}
    shade_on = bool(park_id) and park_id not in SHADE_UNSUPPORTED_PARKS
    current = _current_weather(weather_context)
    air, weight = current.get("air_temp_celsius"), current.get("insolation_weight")
    temps = calculate_surface_temps(float(air), float(weight)) \
        if isinstance(air, (int, float)) and isinstance(weight, (int, float)) else None

    links: List[Dict[str, Any]] = []
    for a, b in zip(points, points[1:]):
        osm_surface = (tags.get(frozenset((a, b))) or {}).get("surface")
        surface = OSM_SURFACE_TO_HEAT_CLASS.get(osm_surface) if osm_surface else None
        shade = near_tree_ratio([a, b]) if shade_on and a != b else None
        temp = None
        if surface is not None and temps is not None:
            temp = cooled_surface_temp(float(air), temps[surface], shade)
        links.append({
            "length": haversine_m(a, b),
            "slope_signed": calculate_segment_signed_slope_percent(a, b) if dem_on and a != b else None,
            "surface": surface,
            "shade": shade,
            "temp": temp,
        })
    return links
