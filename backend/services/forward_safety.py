"""현재 진행 방향의 짧은 OSM 보행 경로와 검증 가능한 안전 지표."""

from typing import Any, Dict, List, Optional, Sequence, Tuple

from agent.route_geometry import bearing_deg, destination_point, haversine_m, polyline_length_m
from agent.road_network_routes import fetch_osrm_foot_route
from services.dem import get_elevation_m
from services.stairs import STEPS_SOURCE, count_route_steps

LOOKAHEAD_M = 250.0
MAX_START_SNAP_M = 45.0
MAX_HEADING_DELTA_DEG = 65.0
SLOPE_BASELINE_M = 150.0
SLOPE_WARNING_PERCENT = 8.0


def _bearing_delta(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _sample_at_distance(coords: Sequence[Sequence[float]], distance_m: float) -> Optional[Tuple[float, float]]:
    traversed = 0.0
    for a, b in zip(coords, coords[1:]):
        segment = haversine_m(a, b)
        if traversed + segment >= distance_m:
            ratio = 0.0 if segment == 0 else (distance_m - traversed) / segment
            return (a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio)
        traversed += segment
    return tuple(coords[-1][:2]) if coords else None


def analyze_forward_safety(lat: float, lon: float, heading_deg: float) -> Dict[str, Any]:
    """진행 방향으로 보행 경로를 임시 생성하고 DEM/OSM 범위 내 정보만 반환한다."""
    target_lat, target_lon = destination_point(lat, lon, heading_deg, LOOKAHEAD_M)
    routed = fetch_osrm_foot_route([(lat, lon), (target_lat, target_lon)], timeout_seconds=1.2)
    unknown = {"status": "unknown", "reason": "route_unavailable"}
    if not routed:
        return {"route_status": "unknown", "route_distance_m": None,
                "slope": unknown, "stairs": unknown}

    coords, _, _ = routed
    distance = polyline_length_m(coords)
    if len(coords) < 2 or distance < 80 or haversine_m([lon, lat], coords[0]) > MAX_START_SNAP_M:
        return {"route_status": "unknown", "route_distance_m": None,
                "slope": unknown, "stairs": unknown}
    first = next((p for p in coords[1:] if haversine_m(coords[0], p) >= 8.0), None)
    if first is None or _bearing_delta(bearing_deg(coords[0], first), heading_deg) > MAX_HEADING_DELTA_DEG:
        return {"route_status": "unknown", "route_distance_m": None,
                "slope": unknown, "stairs": unknown}

    # 50m 표본에서 실제 DEM 값이 모두 있을 때만 방향별 기울기를 계산한다.
    sample_distances = list(range(0, int(min(distance, LOOKAHEAD_M)) + 1, 50))
    if not sample_distances or sample_distances[-1] != min(distance, LOOKAHEAD_M):
        sample_distances.append(min(distance, LOOKAHEAD_M))
    samples = [_sample_at_distance(coords, d) for d in sample_distances]
    elevations = [get_elevation_m(point[1], point[0]) if point else None for point in samples]
    grades: List[Tuple[float, float]] = []
    if all(value is not None for value in elevations):
        for index, start_m in enumerate(sample_distances):
            end_m = start_m + SLOPE_BASELINE_M
            if end_m > min(distance, LOOKAHEAD_M):
                continue
            end_index = min(range(len(sample_distances)), key=lambda i: abs(sample_distances[i] - end_m))
            span = sample_distances[end_index] - start_m
            if span >= SLOPE_BASELINE_M - 5:
                delta = float(elevations[end_index]) - float(elevations[index])
                grades.append((start_m, delta / span * 100.0))
    if grades:
        steep = [(start, grade) for start, grade in grades if abs(grade) >= SLOPE_WARNING_PERCENT]
        slope: Dict[str, Any] = {
            "status": "warning" if steep else "clear",
            "source": "DEM",
            "max_grade_percent": round(max(abs(g) for _, g in grades), 1),
            "warning_distance_m": round(min(start for start, _ in steep)) if steep else None,
            "direction": ("오르막" if max(steep, key=lambda item: abs(item[1]))[1] > 0 else "내리막") if steep else None,
        }
    else:
        slope = {"status": "unknown", "reason": "dem_coverage_missing"}

    stairs_count = count_route_steps(coords)
    stairs: Dict[str, Any] = ({"status": "warning" if stairs_count else "clear", "count": stairs_count,
                              "source": STEPS_SOURCE}
                             if stairs_count is not None else {"status": "unknown", "reason": "osm_coverage_missing"})
    return {"route_status": "available", "route_distance_m": round(min(distance, LOOKAHEAD_M)),
            "slope": slope, "stairs": stairs}
