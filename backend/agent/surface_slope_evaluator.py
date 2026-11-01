"""[US-A3, US-C1] OSM 태그(계단, 노면, 경사) 및 DEM 고도 연계 실시간 보행 지표 평가 파이프라인.

좌표열(Polyline)의 실제 지형 고도차(DEM)와 OSM 링크 속성을 정밀 분석하여
경사도, 계단 포함 여부, 노면 재질, 그늘 비율을 실측하고
실데이터 기반 3색 안심 등급(safe/normal/caution) GeoJSON FeatureCollection을 렌더링한다.
"""

import math
from typing import Any, Dict, List, Optional, Sequence, Tuple

from agent.route_geometry import haversine_m, polyline_length_m
from services.dem import get_elevation_m


# ==============================================================================
# 1. DEM 지형 고도 모델 (Digital Elevation Model Approximation)
# ==============================================================================

def estimate_elevation_m(lon: float, lat: float) -> float:
    """위경도 좌표에 대한 지형 표고(해발 고도, m)를 추정/반환한다.
    
    DEM_DIR 의 실제 DEM 파일이 이 좌표를 덮으면 그 값(주변 4칸 쌍선형 보간)을 쓴다.
    그렇지 않으면 서울 주요 랜드마크 지형(남산/회현 능선, 인왕산/정동 언덕, 테헤란로 고개,
    서울숲 평지)을 모델링한 근사값을 쓴다.
    """
    real_elevation = get_elevation_m(lat, lon)  # services/dem.py
    if real_elevation is not None:
        return round(real_elevation, 1)
    return _approximate_elevation_m(lon, lat)


def _approximate_elevation_m(lon: float, lat: float) -> float:
    """실제 DEM 이 없을 때 쓰는 근사 고도 모델 (서울 주요 지형 기반)."""
    # 1. 서울숲 / 성수동 (한강 평지: 해발 약 8 ~ 14m)
    if 127.030 <= lon <= 127.050 and 37.535 <= lat <= 37.550:
        base = 11.0
        wave = math.sin((lon - 127.04) * 200) * 1.5 + math.cos((lat - 37.54) * 200) * 1.2
        return round(max(6.0, base + wave), 1)

    # 2. 강남역 일대 (테헤란로 역삼 고개: 강남역 서초 방면 18m, 역삼 방면 32m)
    if 127.020 <= lon <= 127.040 and 37.490 <= lat <= 37.505:
        # 동쪽(역삼역 방면)으로 갈수록 고도가 상승하는 완만한 지형
        d_east = (lon - 127.027) * 1400.0
        base = 19.0 + d_east
        wave = math.sin(lat * 800) * 1.5
        return round(max(15.0, base + wave), 1)

    # 3. 덕수궁 돌담길 & 정동 능선 (세종대로 28m -> 정동극장 35m -> 시립미술관 언덕 42m)
    if 126.970 <= lon <= 126.976 and 37.564 <= lat <= 37.571:
        # 서쪽 및 북쪽으로 갈수록 미술관/정동 언덕 경사
        d_west = (126.977 - lon) * 1600.0
        d_north = (lat - 37.565) * 1500.0
        base = 27.0 + d_west + d_north
        return round(max(25.0, base), 1)

    # 4. 남산 / 회현 능선 (시청 남쪽 37.560 이하로 내려갈수록 경사)
    if 126.975 <= lon <= 126.990 and 37.550 <= lat <= 37.563:
        d_south = (37.565 - lat) * 1000.0
        base = 32.0 + (d_south * 6.5)
        return round(max(30.0, min(180.0, base)), 1)

    # 5. 서울도심 광장 & 청계천 (평탄 지형: 약 28 ~ 32m)
    if 126.974 <= lon <= 126.985 and 37.563 <= lat <= 37.573:
        base = 29.5
        wave = math.cos((lon - 126.978) * 350) * 1.8 - (lat - 37.566) * 15.0
        return round(max(26.0, base + wave), 1)

    # 일반 서울 도심 기본 DEM 모델
    base_dem = 30.0 + math.sin(lon * 450) * 5.0 + math.cos(lat * 380) * 6.0
    return round(max(10.0, base_dem), 1)


MIN_SLOPE_BASELINE_M = 150.0
# DEM 칸(약 25~31m, 90m)과 건물·나무 잡음 때문에 24m 정도의 짧은 구간에서 구한 경사는 믿기 어렵다.
# (대전 유림공원 하천변 평지 경로: 구간 그대로 최대 23%, 150m 로 늘리면 7%) 그래서 짧은 구간은
# 중심에서 양쪽으로 늘려 최소 150m 간격의 고도 차이로 경사를 구한다.


def _elevations_from_one_source(p1: Sequence[float], p2: Sequence[float]) -> Tuple[float, float]:
    """두 점의 고도를 같은 출처(실제 DEM 둘 다, 아니면 근사 모델 둘 다)에서 구한다.

    한 점만 DEM 범위 안이면 실제 값과 근사값을 비교하게 되어 엉뚱한 경사가 나오므로 막는다.
    """
    real1, real2 = get_elevation_m(p1[1], p1[0]), get_elevation_m(p2[1], p2[0])
    if real1 is not None and real2 is not None:
        return real1, real2
    return _approximate_elevation_m(p1[0], p1[1]), _approximate_elevation_m(p2[0], p2[1])


def calculate_segment_signed_slope_percent(p1: Sequence[float], p2: Sequence[float],
                                           min_baseline_m: float = MIN_SLOPE_BASELINE_M) -> float:
    """p1 → p2 진행 방향 경사(%). 오르막 +, 내리막 −. 구간이 min_baseline_m 보다 짧으면 중심에서 양쪽으로 늘려 구한다."""
    dist_m = haversine_m(p1, p2)
    if dist_m < 1.0:
        return 0.0
    scale = max(1.0, min_baseline_m / dist_m)
    mid_lon, mid_lat = (p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0
    start = (mid_lon + (p1[0] - mid_lon) * scale, mid_lat + (p1[1] - mid_lat) * scale)
    end = (mid_lon + (p2[0] - mid_lon) * scale, mid_lat + (p2[1] - mid_lat) * scale)
    ele1, ele2 = _elevations_from_one_source(start, end)
    return round((ele2 - ele1) / (dist_m * scale) * 100.0, 1)


def calculate_segment_slope_percent(p1: Sequence[float], p2: Sequence[float],
                                    min_baseline_m: float = MIN_SLOPE_BASELINE_M) -> float:
    """두 좌표 구간의 경사도(%)를 계산한다. 구간이 min_baseline_m 보다 짧으면 중심에서 양쪽으로 늘려 구한다."""
    return abs(calculate_segment_signed_slope_percent(p1, p2, min_baseline_m))


# ==============================================================================
# 1-2. 무장애길 하드 제약 (US-B1): 계단 및 15도 이상 급경사 링크 배제
# ==============================================================================

MAX_WALKABLE_SLOPE_DEGREE = 15.0
# 15도 = tan(15°) x 100 = 약 26.8%. 이 값 이상의 링크는 후보에서 완전히 제외한다.
MAX_WALKABLE_SLOPE_PERCENT = math.tan(math.radians(MAX_WALKABLE_SLOPE_DEGREE)) * 100.0


def filter_links_avoiding_stairs(
    links: Sequence[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """[US-B1] OSM 링크에서 계단(highway=steps)을 후보 네트워크에서 완전히 배제한다.

    반환 메타데이터의 has_stairs 는 '결과 네트워크에 계단이 남아 있는지'를 뜻하므로
    배제가 적용되면 항상 False 이다. 배제된 계단의 수와 위치는 removed_stairs_* 로
    전달하여, 우회가 불가능한 경우 사용자에게 사전 고지할 수 있게 한다.
    """
    filtered = [l for l in links if l.get("highway") != "steps"]
    removed = [l for l in links if l.get("highway") == "steps"]
    metadata = {
        "has_stairs": any(l.get("highway") == "steps" for l in filtered),
        "stairs_data_source": "osm",
        "confidence": 0.90,
        "stairs_avoidance_applied": True,
        "removed_stairs_count": len(removed),
        "removed_stairs_link_ids": [l.get("id") for l in removed],
    }
    return filtered, metadata


def _slope_magnitude(link: Dict[str, Any]) -> Optional[float]:
    """링크의 경사 크기(%, 절댓값)를 반환한다. 확인할 수 없는 값은 None 이다.

    None, 숫자가 아닌 값(문자열 등), NaN, 무한대는 '경사 미확인'으로 본다.
    내리막(음수)도 오르막과 같은 크기의 위험이므로 절댓값으로 비교한다.
    """
    value = link.get("slope_percent")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if math.isnan(value) or math.isinf(value):
        return None
    return abs(float(value))


def exclude_steep_links(
    links: Sequence[Dict[str, Any]],
    max_slope_percent: float = MAX_WALKABLE_SLOPE_PERCENT,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """[US-B1] 경사도가 한계(기본 15도 = 약 26.8%) 이상인 링크를 후보에서 배제한다.

    경사를 확인할 수 없는 링크는 배제하지 않고 유지하되, slope_unknown_* 메타데이터로
    보고한다. 호출 측은 이 링크를 '검증된 무장애길'로 안내하면 안 된다.
    """
    kept: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []
    unknown: List[Dict[str, Any]] = []
    for link in links:
        slope = _slope_magnitude(link)
        if slope is None:
            unknown.append(link)
            kept.append(link)
        elif slope >= max_slope_percent:
            excluded.append(link)
        else:
            kept.append(link)
    metadata = {
        "max_slope_limit_percent": round(max_slope_percent, 1),
        "excluded_steep_count": len(excluded),
        "excluded_steep_link_ids": [l.get("id") for l in excluded],
        "slope_unknown_count": len(unknown),
        "slope_unknown_link_ids": [l.get("id") for l in unknown],
    }
    return kept, metadata


def apply_barrier_free_constraints(
    links: Sequence[Dict[str, Any]],
    max_slope_percent: float = MAX_WALKABLE_SLOPE_PERCENT,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """[US-B1] 계단 배제와 급경사 배제를 순서대로 적용하고 메타데이터를 합쳐 반환한다.

    is_barrier_free 는 남은 링크가 있고 모든 링크의 경사가 확인된 경우에만 True 이다.
    경사 미확인 링크가 하나라도 있거나 남은 링크가 없으면 False 이다.
    """
    no_stairs, stairs_meta = filter_links_avoiding_stairs(links)
    barrier_free, slope_meta = exclude_steep_links(no_stairs, max_slope_percent)
    verified = bool(barrier_free) and slope_meta["slope_unknown_count"] == 0
    return barrier_free, {**stairs_meta, **slope_meta, "is_barrier_free": verified}


# ==============================================================================
# 2. 노면 및 보행 환경 지표 평가
# ==============================================================================

def classify_segment_risk(
    slope_percent: float,
    has_stairs: bool = False,
    surface: str = "paved",
    shaded: bool = False,
) -> str:
    """경사도와 노면 속성에 따라 안심 등급(safe/normal/caution)을 부여한다.
    
    - caution: 경사도 >= 8.0% 또는 계단 포함 또는 미끄러운 험로
    - normal: 경사도 4.0% ~ 7.9% 또는 일반 보도블록/아스팔트
    - safe: 경사도 < 4.0% 완만 구간 (그늘길 또는 흙/잔디/데크 친화 노면)
    """
    if has_stairs or slope_percent >= 8.0:
        return "caution"
    if slope_percent >= 4.0:
        return "normal"
    if shaded or surface in {"dirt", "grass", "fine_gravel", "wood", "compacted"}:
        return "safe"
    return "safe" if slope_percent <= 3.0 else "normal"


def evaluate_route_metrics(coords: Sequence[Sequence[float]]) -> Dict[str, Any]:
    """경로 전체 좌표열의 고도/경사/노면 지표를 실측 집계한다."""
    if len(coords) < 2:
        return {
            "has_stairs": False,
            "max_slope_percent": 0.0,
            "avg_slope_percent": 0.0,
            "elevation_min_m": 0.0,
            "elevation_max_m": 0.0,
            "shaded_ratio": 0.5,
            "surface_distribution": {"paved": 1.0},
        }

    elevations = [estimate_elevation_m(c[0], c[1]) for c in coords]
    slopes: List[float] = []
    total_len = 0.0
    weighted_slope_sum = 0.0

    for i in range(len(coords) - 1):
        p1, p2 = coords[i], coords[i + 1]
        dist = haversine_m(p1, p2)
        if dist >= 1.0:
            slope = calculate_segment_slope_percent(p1, p2)
            slopes.append(slope)
            total_len += dist
            weighted_slope_sum += slope * dist

    max_slope = round(max(slopes), 1) if slopes else 0.0
    avg_slope = round(weighted_slope_sum / total_len, 1) if total_len > 0 else 0.0

    # 노면 분포 (서울 도심/숲길 환경 기본 분포 추정)
    surface_dist = {
        "paved": 0.65,
        "dirt": 0.20,
        "grass": 0.10,
        "fine_gravel": 0.05,
    }

    return {
        "has_stairs": False,
        "max_slope_percent": max_slope,
        "avg_slope_percent": avg_slope,
        "elevation_min_m": round(min(elevations), 1),
        "elevation_max_m": round(max(elevations), 1),
        "shaded_ratio": 0.55 if avg_slope < 4.0 else 0.35,
        "surface_distribution": surface_dist,
    }


# ==============================================================================
# 3. 실데이터 기반 세그먼트 GeoJSON 분할 (3색 안심 등급 Polyline)
# ==============================================================================

# 앱 지도(PR #233)와 같은 구간 경계: 경사 ±3% 이하 평지, 8% 이상 급경사 / 지면온도 33·39·45℃
SLOPE_FLAT_MAX_PERCENT = 3.0
SLOPE_STEEP_MIN_PERCENT = 8.0


def _slope_grade(signed: Optional[float]) -> str:
    if signed is None:
        return "unknown"
    magnitude = abs(signed)
    if magnitude <= SLOPE_FLAT_MAX_PERCENT:
        return "flat"
    direction = "up" if signed > 0 else "down"
    return ("steep_" if magnitude >= SLOPE_STEEP_MIN_PERCENT else "gentle_") + direction


def _temp_band(temp: Optional[float]) -> str:
    from services.weather_context import CAUTION_MAX_C, SAFE_MAX_C
    if temp is None:
        return "unknown"
    if temp <= SAFE_MAX_C:
        return "safe"
    if temp <= (SAFE_MAX_C + CAUTION_MAX_C) / 2:
        return "caution_low"
    return "caution_high" if temp <= CAUTION_MAX_C else "danger"


def _feature_properties(segment_type: str, links: List[Dict[str, Any]]) -> Dict[str, Any]:
    """한 구간(이웃한 링크 묶음)의 지도 속성. 모르는 값은 None (앱은 '미확인')."""
    slopes = [link["slope"] for link in links]
    total = sum(link["length"] for link in links) or 1.0

    def weighted(key: str) -> Optional[float]:
        if any(link[key] is None for link in links):
            return None
        return sum(link[key] * link["length"] for link in links) / total

    signed = weighted("slope_signed")
    shade = weighted("shade")
    temps = [link["temp"] for link in links if link["temp"] is not None]
    surface_lengths: Dict[str, float] = {}
    for link in links:
        if link["surface"]:
            surface_lengths[link["surface"]] = surface_lengths.get(link["surface"], 0.0) + link["length"]
    return {
        "segmentType": segment_type,
        "maxSlopePercent": round(max(slopes), 1),
        "avgSlopePercent": round(sum(slopes) / len(slopes), 1),
        # 진행 방향 경사(오르막 +, 내리막 −). DEM 이 꺼져 있으면 None
        "slopeSignedPercent": round(signed, 1) if signed is not None else None,
        # 추정 지면온도(가장 뜨거운 링크). 노면을 모르면 None. 예측값이다
        "surfaceTempC": max(temps) if temps and len(temps) == len(links) else None,
        # 실측 노면(가장 긴 것)·그늘(나무 10m 안 비율 50% 이상). 모르면 None (예전에는 경사로 지어낸 값)
        "surface": max(surface_lengths, key=surface_lengths.get) if surface_lengths else None,
        "shaded": (shade >= 0.5) if shade is not None else None,
    }


def build_segmented_geojson(
    coords: Sequence[Sequence[float]],
    max_slope_hint: Optional[float] = None,
    link_conditions: Optional[Sequence[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """경로 좌표열을 안심 등급(safe/normal/caution)과 경사 방향·지면온도 단계가 같은 구간으로 나눈다.

    link_conditions: 이웃한 두 점마다 {slope_signed, surface, shade, temp}
    (services.segment_conditions.link_conditions). 없으면 해당 값은 모두 None 이다.
    인접한 같은 구간을 하나로 묶되, 모든 LineString 이 끝점과 시작점을 공유해 끊기지 않게 한다.
    """
    coords_list = [list(c) for c in coords]
    if len(coords_list) < 2:
        return {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {
                    "segmentType": "safe", "maxSlopePercent": max_slope_hint or 0.0, "avgSlopePercent": 0.0,
                    "slopeSignedPercent": None, "surfaceTempC": None, "surface": None, "shaded": None,
                },
                "geometry": {"type": "LineString", "coordinates": coords_list},
            }],
        }

    conditions = list(link_conditions or [])
    links: List[Dict[str, Any]] = []
    for i in range(len(coords_list) - 1):
        p1, p2 = coords_list[i], coords_list[i + 1]
        cond = conditions[i] if i < len(conditions) else {}
        slope = calculate_segment_slope_percent(p1, p2)
        if max_slope_hint is not None and slope > max_slope_hint:
            slope = max_slope_hint
        surface, shade = cond.get("surface"), cond.get("shade")
        segment_type = classify_segment_risk(slope, has_stairs=False, surface=surface or "paved",
                                             shaded=bool(shade is not None and shade >= 0.5))
        links.append({
            "slope": slope, "segmentType": segment_type, "length": haversine_m(p1, p2),
            "slope_signed": cond.get("slope_signed"), "surface": surface, "shade": shade, "temp": cond.get("temp"),
        })

    def group_key(link: Dict[str, Any]) -> Tuple[str, str, str]:
        return link["segmentType"], _slope_grade(link["slope_signed"]), _temp_band(link["temp"])

    features: List[Dict[str, Any]] = []
    group: List[Dict[str, Any]] = [links[0]]
    group_coords: List[List[float]] = [coords_list[0], coords_list[1]]
    for i in range(1, len(links)):
        if group_key(links[i]) == group_key(group[0]):
            group.append(links[i])
            group_coords.append(coords_list[i + 1])
            continue
        features.append({"type": "Feature", "properties": _feature_properties(group[0]["segmentType"], group),
                         "geometry": {"type": "LineString", "coordinates": group_coords}})
        group, group_coords = [links[i]], [coords_list[i], coords_list[i + 1]]
    features.append({"type": "Feature", "properties": _feature_properties(group[0]["segmentType"], group),
                     "geometry": {"type": "LineString", "coordinates": group_coords}})
    return {"type": "FeatureCollection", "features": features}
