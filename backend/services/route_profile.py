"""[US-B1, US-B2] 경로 좌표열에서 실제로 잴 수 있는 보행 지표 (경사·노면·계단).

후보 번호에 따라 정해진 고정 프로필(agent/walk_planning_agent.py `_variant_profile`)과 달리,
실제 경로 좌표와 실제 자료로만 계산한다. 자료가 없는 항목은 추정하지 않고 None(알 수 없음)으로 둔다.

- 경사: 서버 경사 함수(`calculate_segment_slope_percent`, 150m 기준선)와 같은 방법이다.
  DEM 이 켜져 있으면 실제 고도, 꺼져 있으면 근사식이므로 slope_source 로 구분한다.
- 노면·계단: 공원 모드 경로는 공원 보행망(fixtures/park_walk_networks_pilot.json 의 OSM way 태그)과
  구간을 맞춰 길이 비율을 낸다. 태그가 없는 구간은 "unknown" 이다.
  공원 밖 경로(OSRM 등)의 노면은 구간 태그 자료가 없어 None 이다. 계단은 대전·세종 OSM 계단 자료로
  경로가 따라 지나는 계단 수를 센다(services/stairs.py). 자료 범위 밖이면 None.
- 그늘(1단계): 공원 모드 경로만 위성 토지피복(ESA WorldCover 2021)으로 '나무 덮개 10m 안' 길이 비율을 낸다
  (services/landcover.py). 자료 시점(2021) 이후 조성된 공원(도안)과 공원 밖 경로(도심 가로수를 못 잡음)는 None.
"""

from functools import lru_cache
from typing import Any, Dict, FrozenSet, Optional, Sequence, Tuple

from agent.park_route_validation import load_park_networks
from agent.route_geometry import haversine_m
from agent.surface_slope_evaluator import calculate_segment_slope_percent
from services.dem import elevation_source
from services.landcover import LANDCOVER_SOURCE, near_tree_ratio
from services.stairs import STEPS_SOURCE, count_route_steps

# OSM surface 값 중 반려견 발에 부드러운 노면 (흙·잔디·자갈·나무칩 등)
SOFT_SURFACES = {"dirt", "earth", "ground", "grass", "fine_gravel", "gravel", "compacted", "unpaved",
                 "woodchips", "wood", "sand", "mud"}
MIN_SEGMENT_M = 1.0  # evaluate_route_metrics 와 같은 기준: 1m 미만 구간은 경사 계산에서 뺀다
# 그늘을 계산하지 않는 공원과 이유 (토지피복 자료 시점과 맞지 않음)
SHADE_UNSUPPORTED_PARKS = {"doan": "ESA WorldCover 2021 에서 공원 조성 전 경작지로 분류됨"}

Point = Tuple[float, float]


@lru_cache(maxsize=8)
def _edge_tags(park_id: str) -> Dict[FrozenSet[Point], Dict[str, str]]:
    """공원 보행망의 (점, 점) 구간 → OSM way 태그."""
    data = load_park_networks().get(park_id) or {}
    edges: Dict[FrozenSet[Point], Dict[str, str]] = {}
    for way in data.get("ways", []):
        coords = way.get("coordinates") or []
        tags = way.get("tags") or {}
        for a, b in zip(coords, coords[1:]):
            edges[frozenset((tuple(a), tuple(b)))] = tags
    return edges


_PROFILE_CACHE: dict = {}
_PROFILE_CACHE_MAX = 256


def measure_route_profile(coords: Sequence[Sequence[float]], park_id: Optional[str] = None) -> Dict[str, Any]:
    """경로 좌표열([경도, 위도] 목록)의 실측 지표. park_id 를 주면 그 공원 보행망 태그로 노면·계단을 계산한다."""
    if len(coords) < 2:
        source = elevation_source()
        return {
            "distance_m": 0.0, "max_slope_percent": 0.0, "avg_slope_percent": 0.0,
            "slope_source": "dem" if source else "approximation",
            "elevation_source": source["name"] if source else None,
            "surface_breakdown": None, "surface_known_ratio": None, "soft_surface_ratio": None,
            "stairs_count": None, "stairs_source": None, "shade_ratio": None, "shade_source": None,
            "basis": f"park_network:{park_id}" if park_id else "no_osm_tags",
        }

    cache_key = (park_id, tuple((round(c[0], 6), round(c[1], 6)) for c in coords))
    cached = _PROFILE_CACHE.get(cache_key)
    if cached is not None:
        return dict(cached)

    source = elevation_source()
    profile: Dict[str, Any] = {
        "distance_m": 0.0, "max_slope_percent": 0.0, "avg_slope_percent": 0.0,
        "slope_source": "dem" if source else "approximation",
        "elevation_source": source["name"] if source else None,
        "surface_breakdown": None, "surface_known_ratio": None, "soft_surface_ratio": None,
        "stairs_count": None, "stairs_source": None, "shade_ratio": None, "shade_source": None,
        "basis": f"park_network:{park_id}" if park_id else "no_osm_tags",
    }

    edges = _edge_tags(park_id) if park_id else {}
    total = weighted = max_slope = 0.0
    surfaces: Dict[str, float] = {}
    stairs = 0
    for a, b in zip(coords, coords[1:]):
        length = haversine_m(a, b)
        if length < MIN_SEGMENT_M:
            continue
        slope = calculate_segment_slope_percent(a, b)
        total += length
        weighted += slope * length
        max_slope = max(max_slope, slope)
        if park_id:
            tags = edges.get(frozenset(((a[0], a[1]), (b[0], b[1]))), {})
            surface = tags.get("surface") or "unknown"
            surfaces[surface] = surfaces.get(surface, 0.0) + length
            stairs += tags.get("highway") == "steps"

    profile.update(distance_m=round(total, 1), max_slope_percent=round(max_slope, 1),
                   avg_slope_percent=round(weighted / total, 1) if total else 0.0)
    if park_id and total:
        known = total - surfaces.get("unknown", 0.0)
        profile.update(
            surface_breakdown={k: round(v / total, 3) for k, v in sorted(surfaces.items(), key=lambda kv: -kv[1])},
            surface_known_ratio=round(known / total, 3),
            soft_surface_ratio=round(sum(v for k, v in surfaces.items() if k in SOFT_SURFACES) / total, 3),
            stairs_count=stairs, stairs_source="park_network_osm_tags",
        )
    if not park_id:
        steps = count_route_steps(coords)
        if steps is not None:
            profile.update(stairs_count=steps, stairs_source=STEPS_SOURCE)
    if park_id and park_id not in SHADE_UNSUPPORTED_PARKS:
        shade = near_tree_ratio(coords)
        if shade is not None:
            profile.update(shade_ratio=shade, shade_source=LANDCOVER_SOURCE)

    if len(_PROFILE_CACHE) >= _PROFILE_CACHE_MAX:
        _PROFILE_CACHE.clear()
    _PROFILE_CACHE[cache_key] = dict(profile)
    return profile
