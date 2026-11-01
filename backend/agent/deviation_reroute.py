"""[편안하개 - PetWalk]
경로 이탈(Deviation) 시 출발 모드별 맞춤 경로 재생성 및 보행망 합류 모듈.

- 방법 A (현위치 기반 모드, origin_mode='current_location'):
  현재(벗어난) 위치에서 출발해 남은 산책 거리만큼 보행로를 경유한 뒤
  최초 출발지(destination)로 돌아오는 새 산책 경로를 생성한다.
- 방법 C (지정 공원 모드, origin_mode='park' | 'parking_pnr'):
  현재 위치에서 기존 공원 코스의 전방 합류 지점까지 직선이 아닌
  실제 공원 보행망(networkx) 또는 OSRM 보행 도로망을 따라 연결한 뒤 남은 코스를 이어 간다.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx

from agent.park_route_validation import RoutePlanningError, build_park_graph
from agent.pilot_park_routes import resolve_pilot_park_key
from agent.road_network_routes import fetch_osrm_foot_route
from agent.route_geometry import collapse_backtracks, destination_point, haversine_m, polyline_length_m
from agent.route_steps import build_turn_steps

_REJOIN_BACKTRACK_TOLERANCE_M = 30.0   # 진행 거리보다 이만큼 뒤쪽 후보까지는 전방으로 취급
_REJOIN_FORWARD_SLACK_M = 60.0         # 전방 후보가 전체 최근접보다 이만큼 이상 멀면 최근접 사용
_REJOIN_SAME_PLACE_M = 15.0            # 같은 자리(여러 바퀴)로 볼 거리
_DETOUR_FACTOR = 1.35                  # 직선/기하 거리 대비 실제 도로망 우회 계수
_MIN_LOOP_REM_M = 180.0                # 경유 루프를 만들 최소 남은 거리(m)
_DENSIFY_STEP_M = 25.0                 # 오프라인 폴백 선분 보간 간격(m)


def collect_projections(coords: List[List[float]], lat: float, lon: float) -> List[Dict[str, Any]]:
    """현재 위치를 코스의 모든 선분에 투영한 후보 [{point, next_index, progress_m, distance_m}]."""
    cos_lat = math.cos(math.radians(lat))
    candidates: List[Dict[str, Any]] = []
    traversed = 0.0
    for index in range(1, len(coords)):
        a, b = coords[index - 1], coords[index]
        ax, ay = (a[0] - lon) * 111_320.0 * cos_lat, (a[1] - lat) * 110_540.0
        bx, by = (b[0] - lon) * 111_320.0 * cos_lat, (b[1] - lat) * 110_540.0
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        ratio = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
        segment_m = haversine_m(a, b)
        candidates.append({
            "point": [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio],
            "next_index": index,
            "progress_m": traversed + ratio * segment_m,
            "distance_m": math.hypot(ax + ratio * dx, ay + ratio * dy),
        })
        traversed += segment_m
    return candidates


def select_projection(candidates: List[Dict[str, Any]], progress_m: Optional[float]) -> Optional[Dict[str, Any]]:
    """합류 지점 선택. 진행 거리 힌트가 있으면 지금까지 온 곳보다 앞쪽에서 가장 가까운 지점을 우선."""
    if not candidates:
        return None
    nearest = min(candidates, key=lambda c: c["distance_m"])
    if progress_m is None:
        return nearest
    forward = [c for c in candidates if c["progress_m"] >= progress_m - _REJOIN_BACKTRACK_TOLERANCE_M]
    if not forward:
        return nearest
    nearest_forward = min(forward, key=lambda c: c["distance_m"])
    if nearest_forward["distance_m"] > nearest["distance_m"] + _REJOIN_FORWARD_SLACK_M:
        return nearest
    same_place = [c for c in forward if c["distance_m"] <= nearest_forward["distance_m"] + _REJOIN_SAME_PLACE_M]
    return min(same_place, key=lambda c: c["progress_m"])


def _bearing_deg(from_lat: float, from_lon: float, to_lat: float, to_lon: float) -> float:
    """두 위경도 점 사이의 방위각(0~360도)."""
    lat1, lat2 = math.radians(from_lat), math.radians(to_lat)
    d_lon = math.radians(to_lon - from_lon)
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def _merge_clean_path(points: List[List[float]]) -> List[List[float]]:
    """인접 중복점(1m 미만)을 제거하여 매끄러운 좌표열을 만든다."""
    cleaned: List[List[float]] = []
    for pt in points:
        coord = [round(float(pt[0]), 6), round(float(pt[1]), 6)]
        if not cleaned or haversine_m(cleaned[-1], coord) >= 1.0:
            cleaned.append(coord)
    if len(cleaned) == 1 and points:
        cleaned.append([round(float(points[-1][0]), 6), round(float(points[-1][1]), 6)])
    return cleaned


def _densify_waypoints(waypoints: List[Tuple[float, float]]) -> List[List[float]]:
    """오프라인 폴백 시 (lat, lon) 웨이포인트 사이를 일정 간격으로 보간한 [lon, lat] 좌표열 반환."""
    coords: List[List[float]] = []
    for a, b in zip(waypoints, waypoints[1:]):
        start_pt, end_pt = (a[1], a[0]), (b[1], b[0])
        steps = max(1, math.ceil(haversine_m(start_pt, end_pt) / _DENSIFY_STEP_M))
        for idx in range(steps):
            ratio = idx / steps
            coords.append([
                round(start_pt[0] + (end_pt[0] - start_pt[0]) * ratio, 6),
                round(start_pt[1] + (end_pt[1] - start_pt[1]) * ratio, 6),
            ])
    if waypoints:
        coords.append([round(waypoints[-1][1], 6), round(waypoints[-1][0], 6)])
    return _merge_clean_path(coords)


def _build_reroute_step_pins(
    coords: List[List[float]],
    join_point: Optional[List[float]] = None,
) -> List[Dict[str, Any]]:
    """재탐색/재생성된 경로의 회전 안내 핀 목록을 생성한다."""
    steps = build_turn_steps(coords)
    pins: List[Dict[str, Any]] = []
    if join_point is not None:
        pins.append({
            "id": "reroute_join_pin",
            "kind": "turn",
            "position": [round(join_point[0], 6), round(join_point[1], 6)],
            "instruction": "기존 산책 경로에 다시 합류하세요.",
        })
    for idx, step in enumerate(steps):
        pos = step.get("position") or (coords[min(idx + 1, len(coords) - 1)] if coords else [0.0, 0.0])
        pins.append({
            "id": f"reroute_step_{idx + 1}",
            "kind": "caution" if "주의" in step.get("instruction", "") else "turn",
            "position": pos,
            "instruction": step.get("instruction", "보행로를 따라 안전하게 이동하세요"),
        })
    return pins


def _resolve_remaining_distance_m(
    remaining_distance_m: Optional[float],
    route_coordinates: Optional[List[List[float]]],
    progress_m: Optional[float],
    direct_m: float,
) -> float:
    """재생성할 경로의 남은 목표 거리(m)를 계산한다."""
    if remaining_distance_m is not None and remaining_distance_m > 0:
        return float(remaining_distance_m)
    if route_coordinates and len(route_coordinates) >= 2:
        total_m = polyline_length_m(route_coordinates)
        walked_m = float(progress_m or 0.0)
        return max(_MIN_LOOP_REM_M, total_m - walked_m)
    return max(300.0, direct_m * 1.5)


def _build_return_loop_waypoints(
    cur_lat: float,
    cur_lon: float,
    dest_lat: float,
    dest_lon: float,
    target_rem_m: float,
) -> List[Tuple[float, float]]:
    """현재(벗어난) 위치에서 출발해 남은 거리를 소화하고 원래 출발지(dest)로 돌아오는 웨이포인트."""
    direct_m = haversine_m((cur_lon, cur_lat), (dest_lon, dest_lat))
    if target_rem_m <= max(direct_m * _DETOUR_FACTOR, _MIN_LOOP_REM_M):
        return [(cur_lat, cur_lon), (dest_lat, dest_lon)]

    geom_budget_m = target_rem_m / _DETOUR_FACTOR
    if direct_m < 35.0:
        bearing = _bearing_deg(dest_lat, dest_lon, cur_lat, cur_lon) if direct_m > 1.0 else 45.0
        radius = max(45.0, geom_budget_m / (2.0 * math.pi))
        center_lat, center_lon = destination_point(cur_lat, cur_lon, bearing, radius)
        w1 = destination_point(center_lat, center_lon, (bearing + 270.0) % 360.0, radius)
        w2 = destination_point(center_lat, center_lon, bearing, radius)
        w3 = destination_point(center_lat, center_lon, (bearing + 90.0) % 360.0, radius)
        return [(cur_lat, cur_lon), w1, w2, w3, (dest_lat, dest_lon)]

    bearing_cd = _bearing_deg(cur_lat, cur_lon, dest_lat, dest_lon)
    perp_bearing = (bearing_cd + 90.0) % 360.0
    lateral_m = min(max(45.0, (geom_budget_m - direct_m * 0.6) / 1.8), 1200.0)
    p1_lat = cur_lat + (dest_lat - cur_lat) / 3.0
    p1_lon = cur_lon + (dest_lon - cur_lon) / 3.0
    p2_lat = cur_lat + (dest_lat - cur_lat) * 2.0 / 3.0
    p2_lon = cur_lon + (dest_lon - cur_lon) * 2.0 / 3.0
    w1 = destination_point(p1_lat, p1_lon, perp_bearing, lateral_m)
    w2 = destination_point(p2_lat, p2_lon, perp_bearing, lateral_m)
    return [(cur_lat, cur_lon), w1, w2, (dest_lat, dest_lon)]


def build_current_location_regenerated_route(
    current_lat: float,
    current_lon: float,
    destination_lat: float,
    destination_lon: float,
    route_coordinates: Optional[List[List[float]]] = None,
    progress_m: Optional[float] = None,
    remaining_distance_m: Optional[float] = None,
) -> Dict[str, Any]:
    """[방법 A] 현위치 기반 산책 모드: 벗어난 위치에서 남은 거리를 경유해 원래 출발지로 복귀하는 새 경로 생성."""
    start = [current_lon, current_lat]
    end = [destination_lon, destination_lat]
    direct_m = haversine_m(start, end)
    target_rem_m = _resolve_remaining_distance_m(remaining_distance_m, route_coordinates, progress_m, direct_m)
    waypoints = _build_return_loop_waypoints(current_lat, current_lon, destination_lat, destination_lon, target_rem_m)

    osrm_res = fetch_osrm_foot_route(waypoints, timeout_seconds=2.5)
    if osrm_res is not None:
        cleaned = collapse_backtracks(osrm_res[0])
        coords = _merge_clean_path([start] + cleaned + [end])
        route_source = "osrm_live"
    else:
        coords = _merge_clean_path([start] + _densify_waypoints(waypoints) + [end])
        route_source = "geometric_fallback"

    dist_m = round(polyline_length_m(coords), 1)
    est_min = max(1, round(dist_m / 46.7))
    return {
        "coordinates": coords,
        "distance_m": dist_m,
        "hazard_clearance_m": 0.0,
        "reroute_strategy": "regenerate_to_origin",
        "route_source": route_source,
        "step_pins": _build_reroute_step_pins(coords),
        "voice_alert": (
            f"경로를 벗어나 현재 위치에서 출발지로 돌아오는 약 {est_min}분, "
            f"{round(dist_m / 10) * 10:.0f}미터 산책 경로를 새로 생성했습니다."
        ),
    }


def _find_park_graph_approach(
    start: List[float],
    join_pt: List[float],
    park_key: Optional[str],
) -> Optional[List[List[float]]]:
    """지정 공원의 내부 보행망 그래프(networkx)를 따라 현재 위치에서 합류점까지 최단 보행 경로를 탐색."""
    if not park_key:
        return None
    try:
        graph = build_park_graph(park_key)
    except RoutePlanningError:
        return None
    if not graph.nodes:
        return None
    u = min(graph.nodes, key=lambda n: haversine_m(tuple(start), n))
    v = min(graph.nodes, key=lambda n: haversine_m(tuple(join_pt), n))
    if haversine_m(tuple(start), u) > 250.0 or haversine_m(tuple(join_pt), v) > 120.0:
        return None
    if u == v:
        return _merge_clean_path([start, list(u), join_pt])
    if not nx.has_path(graph, u, v):
        return None
    node_path = [list(n) for n in nx.shortest_path(graph, u, v, weight="weight")]
    return _merge_clean_path([start] + node_path + [join_pt])


def build_park_network_rejoin_route(
    current_lat: float,
    current_lon: float,
    destination_lat: float,
    destination_lon: float,
    route_coordinates: Optional[List[List[float]]] = None,
    progress_m: Optional[float] = None,
    pilot_park_id: Optional[str] = None,
) -> Dict[str, Any]:
    """[방법 C] 지정 공원 모드: 현재 위치에서 공원 보행망/OSRM 실제 보행로를 따라 기존 코스로 합류."""
    start = [current_lon, current_lat]
    end = [destination_lon, destination_lat]
    base = list(route_coordinates) if route_coordinates else [start, end]
    if base[-1] != end:
        base = base + [end]

    join = select_projection(collect_projections(base, current_lat, current_lon), progress_m)
    if join is None:
        coords = [start, end]
        return {
            "coordinates": coords,
            "distance_m": round(polyline_length_m(coords), 1),
            "hazard_clearance_m": 0.0,
            "reroute_strategy": "park_network_rejoin",
            "route_source": "segment_projection_fallback",
            "step_pins": _build_reroute_step_pins(coords),
            "voice_alert": "경로를 재탐색했습니다. 안전한 새 경로로 안내합니다.",
        }

    join_pt = [float(join["point"][0]), float(join["point"][1])]
    rest = [list(pt) for pt in base[join["next_index"]:]]
    if rest and haversine_m(join_pt, rest[0]) < 1.0:
        rest.pop(0)

    park_key = resolve_pilot_park_key(current_lat, current_lon, pilot_park_id=pilot_park_id)
    approach = _find_park_graph_approach(start, join_pt, park_key)
    route_source = f"park_graph_{park_key}" if approach is not None else "segment_projection_fallback"

    if approach is None:
        osrm_res = fetch_osrm_foot_route([(current_lat, current_lon), (join_pt[1], join_pt[0])], timeout_seconds=2.0)
        if osrm_res is not None:
            approach = _merge_clean_path([start] + osrm_res[0] + [join_pt])
            route_source = "osrm_live"
        else:
            approach = _merge_clean_path([start, join_pt])

    join_dist_m = round(polyline_length_m(approach), 1)
    coords = _merge_clean_path(approach + rest)
    rounded_join_m = max(10, round(join_dist_m / 10) * 10)
    return {
        "coordinates": coords,
        "distance_m": round(polyline_length_m(coords), 1),
        "hazard_clearance_m": 0.0,
        "join_distance_m": join_dist_m,
        "reroute_strategy": "park_network_rejoin",
        "route_source": route_source,
        "step_pins": _build_reroute_step_pins(coords, join_point=join_pt),
        "voice_alert": f"공원 산책로를 따라 약 {rounded_join_m}미터 이동해 기존 산책 경로에 다시 합류하세요.",
    }

