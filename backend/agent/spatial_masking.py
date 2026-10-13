"""[US-G2] 프라이버시 보호를 위한 공간 마스킹 및 교차로(Node) 스냅 절단 엔진.

1. 출발지(Origin) 및 도착지(Destination) 기준 최소 200m 안전 반경 절단.
2. 역추적 공격(Trajectory Inference Attack / Reverse Geospatial Reconstruction) 차단:
   - 단순 직선 거리 절단 시 발생하는 '골목길 외길 연장선 추정' 취약점 방지.
   - 200m 이후 궤적에서 가장 먼저 마주치는 도로망 다중 분기 교차로(Node, Degree >= 3)
     또는 방향 변곡점(코너/갈림길)으로 시작점/종료점을 스냅(Intersection Snap Trimming).
   - 다중 갈래길로 이동 경로가 분산되므로, 공격자가 경로를 거꾸로 추적하더라도
     어느 주택/아파트에서 출발했는지 역추정하는 것이 불가능함.
"""

import math
from typing import Any, Dict, List, Optional, Tuple
import networkx as nx

from agent.offline_walk_network import NETWORKS, build_region_graph


def calculate_haversine_distance_m(
    coord1: Tuple[float, float],
    coord2: Tuple[float, float],
) -> float:
    """(lat, lon) 튜플 간의 하버사인 거리(미터) 계산."""
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    R = 6371000.0  # 지구 반경 (m)

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


# 캐싱된 네트워크 교차로 노드 목록 [(node_id, [lon, lat], degree)]
_CACHED_INTERSECTIONS: Optional[List[Dict[str, Any]]] = None


def get_network_intersections() -> List[Dict[str, Any]]:
    """등록된 도로망 그래프에서 차수(Degree)가 3 이상인 다중 분기 교차로 노드 목록을 추출한다."""
    global _CACHED_INTERSECTIONS
    if _CACHED_INTERSECTIONS is not None:
        return _CACHED_INTERSECTIONS

    intersections: List[Dict[str, Any]] = []
    for region_key in NETWORKS.keys():
        G, _ = build_region_graph(region_key)
        for node_id, data in G.nodes(data=True):
            deg = G.degree(node_id)
            if deg >= 3:  # 삼거리, 사거리 등 다중 분기점
                coord = data["coord"]  # [lon, lat]
                intersections.append({
                    "node_id": node_id,
                    "region": region_key,
                    "coord": coord,
                    "degree": deg,
                })

    _CACHED_INTERSECTIONS = intersections
    return _CACHED_INTERSECTIONS


def calculate_turn_angle_deg(
    p1: List[float], p2: List[float], p3: List[float]
) -> float:
    """세 점 간의 회전 각도(0도=직진, 90도=직각 회전)를 계산한다."""
    v1 = (p2[0] - p1[0], p2[1] - p1[1])
    v2 = (p3[0] - p2[0], p3[1] - p2[1])

    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.sqrt(v1[0] ** 2 + v1[1] ** 2)
    mag2 = math.sqrt(v2[0] ** 2 + v2[1] ** 2)

    if mag1 < 1e-9 or mag2 < 1e-9:
        return 0.0

    cos_val = max(-1.0, min(1.0, dot / (mag1 * mag2)))
    return math.degrees(math.acos(cos_val))


def find_first_intersection_index(
    coordinates: List[List[float]],
    start_search_idx: int,
    forward: bool = True,
    search_radius_m: float = 35.0,
) -> Optional[Tuple[int, Dict[str, Any]]]:
    """200m 경계 이후 궤적에서 가장 먼저 만나는 도로망 교차로 또는 변곡점을 찾는다."""
    intersections = get_network_intersections()
    indices = (
        range(start_search_idx, len(coordinates))
        if forward
        else range(start_search_idx, -1, -1)
    )

    # 1순위: 도로망 데이터베이스의 실제 교차로(Degree >= 3) 노드 인근 매칭
    for idx in indices:
        pt = coordinates[idx]
        pt_latlon = (pt[1], pt[0])
        for inter in intersections:
            inter_latlon = (inter["coord"][1], inter["coord"][0])
            dist = calculate_haversine_distance_m(pt_latlon, inter_latlon)
            if dist <= search_radius_m:
                return idx, {
                    "type": "network_intersection",
                    "node_id": inter["node_id"],
                    "degree": inter["degree"],
                    "distance_to_node_m": dist,
                }

    # 2순위: 도로망 DB 외곽 지역인 경우 궤적 자체의 분기/회전각(35도 이상) 변곡점 매칭
    step = 1 if forward else -1
    for idx in indices:
        if 0 < idx < len(coordinates) - 1:
            angle = calculate_turn_angle_deg(
                coordinates[idx - step], coordinates[idx], coordinates[idx + step]
            )
            if angle >= 35.0:  # 코너 또는 갈림길 진입
                return idx, {
                    "type": "trajectory_corner_snap",
                    "turn_angle_deg": round(angle, 1),
                }

    return None


def apply_spatial_masking_to_course(
    coordinates: List[List[float]],
    masking_radius_m: float = 200.0,
    snap_to_intersection: bool = True,
) -> Dict[str, Any]:
    """[US-G2] 출발지/도착지 200m 공간 절단 및 교차로(Node) 스냅 마스킹.

    Args:
        coordinates: [[lon, lat], ...] 형식의 원본 보행 궤적 좌표 리스트
        masking_radius_m: 최소 절단 반경 (기본 200m)
        snap_to_intersection: 교차로/분기점 노드로 스냅 확장 여부 (기본 True)

    Returns:
        마스킹된 좌표 및 프라이버시 보호 메타데이터
    """
    if len(coordinates) < 4:
        return {
            "masked_coordinates": [],
            "is_masked": False,
            "error": "경로 좌표가 너무 짧아 마스킹을 적용할 수 없습니다.",
            "masking_radius_m": masking_radius_m,
            "intersection_snapped": False,
        }

    origin = (coordinates[0][1], coordinates[0][0])  # (lat, lon)
    destination = (coordinates[-1][1], coordinates[-1][0])

    # 1. 출발지 200m 경계 인덱스 탐색
    first_outside_start_idx = 0
    for idx, pt in enumerate(coordinates):
        curr = (pt[1], pt[0])
        dist = calculate_haversine_distance_m(origin, curr)
        if dist > masking_radius_m:
            first_outside_start_idx = idx
            break
    else:
        # 전 구간이 200m 이내인 경우
        return {
            "masked_coordinates": [],
            "is_masked": True,
            "trimmed_start_points": len(coordinates),
            "trimmed_end_points": 0,
            "masking_radius_m": masking_radius_m,
            "intersection_snapped": False,
        }

    # 2. 도착지 200m 경계 인덱스 탐색 (뒤에서부터)
    last_outside_dest_idx = len(coordinates) - 1
    for idx in range(len(coordinates) - 1, -1, -1):
        pt = coordinates[idx]
        curr = (pt[1], pt[0])
        dist = calculate_haversine_distance_m(destination, curr)
        if dist > masking_radius_m:
            last_outside_dest_idx = idx
            break
    else:
        return {
            "masked_coordinates": [],
            "is_masked": True,
            "trimmed_start_points": 0,
            "trimmed_end_points": len(coordinates),
            "masking_radius_m": masking_radius_m,
            "intersection_snapped": False,
        }

    if first_outside_start_idx > last_outside_dest_idx:
        return {
            "masked_coordinates": [],
            "is_masked": True,
            "trimmed_start_points": len(coordinates),
            "trimmed_end_points": 0,
            "masking_radius_m": masking_radius_m,
            "intersection_snapped": False,
        }

    start_cut_idx = first_outside_start_idx
    end_cut_idx = last_outside_dest_idx
    start_intersection_info: Optional[Dict[str, Any]] = None
    end_intersection_info: Optional[Dict[str, Any]] = None

    # 3. 🎯 교차로(Node) 스냅 절단 적용
    if snap_to_intersection:
        # 200m 이후 가장 먼저 만나는 다중 교차로(Degree >= 3)로 출발 지점 스냅 전진
        snap_start = find_first_intersection_index(
            coordinates, start_search_idx=first_outside_start_idx, forward=True
        )
        if snap_start is not None and snap_start[0] <= end_cut_idx:
            start_cut_idx = snap_start[0]
            start_intersection_info = snap_start[1]

        # 도착지 200m 이전 지점 중 가장 가까운 다중 교차로로 도착 지점 스냅 후진
        snap_end = find_first_intersection_index(
            coordinates, start_search_idx=last_outside_dest_idx, forward=False
        )
        if snap_end is not None and snap_end[0] >= start_cut_idx:
            end_cut_idx = snap_end[0]
            end_intersection_info = snap_end[1]

    final_coords = coordinates[start_cut_idx : end_cut_idx + 1]
    trimmed_start = start_cut_idx
    trimmed_end = (len(coordinates) - 1) - end_cut_idx

    return {
        "masked_coordinates": final_coords,
        "is_masked": True,
        "trimmed_start_points": trimmed_start,
        "trimmed_end_points": trimmed_end,
        "masking_radius_m": masking_radius_m,
        "intersection_snapped": snap_to_intersection
        and (
            start_intersection_info is not None or end_intersection_info is not None
        ),
        "start_intersection": start_intersection_info,
        "end_intersection": end_intersection_info,
    }
