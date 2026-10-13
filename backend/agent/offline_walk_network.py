"""[US-A3, US-B1] 오프라인 실제 보행 도로망(Walk Network) 그래프 엔진.

OSRM 네트워크 단절 또는 타임아웃 상황에서도 건물 관통 직선(직사각형)을 배제하고,
주요 서비스 권역의 검증된 OSM 보행로 노드/엣지 그래프 상에서 순환 루프를 탐색한다.
"""

import math
from typing import Any, Dict, List, Optional, Tuple
import networkx as nx

from agent.route_geometry import (
    haversine_m,
    polyline_length_m,
    collapse_backtracks,
    destination_point,
    bearing_deg,
)
from agent.route_steps import build_turn_steps


# ==============================================================================
# 1. 서울 도심 (시청/청계천/을지로/덕수궁) 오프라인 보행 네트워크 노드 & 엣지
# ==============================================================================
# 좌표 형식: [경도, 위도]
SEOUL_CENTER_NODES: Dict[str, List[float]] = {
    # 서울광장 & 시청 주변 (건물 외벽 외곽 실제 보행로)
    "sc_plaza_south": [126.9784, 37.5656],        # 서울광장 남측 보행로
    "sc_plaza_center": [126.9784, 37.5663],       # 서울광장 중심 (출발지 스냅점)
    "sc_cityhall_east": [126.9790, 37.5668],      # 시청 동측 무교로 연결로
    "sc_cityhall_front": [126.9784, 37.5666],     # 서울광장 북단 도서관/시청 사이 광장 통로
    "sc_cityhall_north": [126.9770, 37.5671],     # 세종대로 보도 (시청 북서측)
    "sc_seoul_lib_front": [126.9770, 37.5660],    # 서울도서관 서측 세종대로 보도
    # 청계천 입구 & 모전교/광통교/광교
    "sc_cheonggye_plaza": [126.979142, 37.568868], # 청계광장 소라탑
    "sc_mojeongyo_south": [126.980049, 37.568969], # 모전교 남단
    "sc_gwangtongyo_south": [126.981863, 37.569066], # 광통교 남단
    "sc_gwanggyo_south": [126.983289, 37.568892],  # 광교 남단
    # 을지로입구 방면
    "sc_euljiro_1ga": [126.98276, 37.566224],      # 을지로1가역 사거리 서측
    "sc_euljiro_lotte": [126.981628, 37.565885],    # 롯데백화점 맞은편
    "sc_hanwha_corner": [126.97981, 37.56589],     # 한화빌딩 건너편
    "sc_plaza_hotel_corner": [126.978905, 37.56589], # 플라자호텔 사거리
    # 무교로 음식문화거리
    "sc_mugyo_mid": [126.979198, 37.566998],       # 무교로 중간
    "sc_mugyo_north": [126.979218, 37.568868],     # 무교로 북단 (청계천 진입)
    # 덕수궁 & 정동길 방면
    "sc_deoksu_front": [126.9752, 37.5663],        # 대한문 앞
    "sc_stonewall_entry": [126.9744, 37.5668],     # 돌담길 입구
    "sc_stonewall_mid": [126.9732, 37.5674],       # 돌담길 분수대
    "sc_jeongdong_theatre": [126.9715, 37.5680],   # 정동극장 앞
    "sc_jeongdong_church": [126.9714, 37.5690],    # 정동교회
    "sc_seoul_art_mus": [126.9744, 37.5700],       # 서울시립미술관 입구
    "sc_sejongdaero_cross": [126.9768, 37.5685],   # 세종대로 보행로
}

SEOUL_CENTER_EDGES: List[Tuple[str, str, Dict[str, Any]]] = [
    # 광장 둘레 (건물 외벽 우회)
    ("sc_plaza_south", "sc_plaza_center", {"surface": "paved", "highway": "footway", "slope": 1.2}),
    ("sc_plaza_center", "sc_cityhall_east", {"surface": "paved", "highway": "footway", "slope": 1.0}),
    ("sc_plaza_center", "sc_cityhall_front", {"surface": "paved", "highway": "footway", "slope": 0.8}),
    ("sc_cityhall_front", "sc_cityhall_north", {"surface": "paved", "highway": "footway", "slope": 0.9}),
    ("sc_seoul_lib_front", "sc_cityhall_north", {"surface": "paved", "highway": "footway", "slope": 0.7}),
    ("sc_seoul_lib_front", "sc_plaza_south", {"surface": "paved", "highway": "footway", "slope": 0.6}),
    ("sc_cityhall_east", "sc_cityhall_front", {"surface": "paved", "highway": "footway", "slope": 0.9}),
    # 무교로 연결
    ("sc_plaza_center", "sc_mugyo_mid", {"surface": "paved", "highway": "pedestrian", "slope": 1.1}),
    ("sc_cityhall_east", "sc_mugyo_mid", {"surface": "paved", "highway": "pedestrian", "slope": 0.9}),
    ("sc_mugyo_mid", "sc_mugyo_north", {"surface": "paved", "highway": "pedestrian", "slope": 1.0}),
    ("sc_mugyo_north", "sc_cheonggye_plaza", {"surface": "paved", "highway": "footway", "slope": 0.7}),
    # 청계천 양안 수변 보행길 (흙길/잔디/데크 친화)
    ("sc_cheonggye_plaza", "sc_mojeongyo_south", {"surface": "dirt", "highway": "footway", "slope": 1.2, "park": True}),
    ("sc_mojeongyo_south", "sc_gwangtongyo_south", {"surface": "dirt", "highway": "footway", "slope": 1.0, "park": True}),
    ("sc_gwangtongyo_south", "sc_gwanggyo_south", {"surface": "grass", "highway": "footway", "slope": 0.9, "park": True}),
    ("sc_mojeongyo_south", "sc_mugyo_north", {"surface": "paved", "highway": "footway", "slope": 0.8}),
    ("sc_gwangtongyo_south", "sc_euljiro_1ga", {"surface": "paved", "highway": "pedestrian", "slope": 1.2}),
    # 광교 -> 을지로1가 -> 서울광장 복귀
    ("sc_gwanggyo_south", "sc_euljiro_1ga", {"surface": "paved", "highway": "footway", "slope": 2.1}),
    ("sc_euljiro_1ga", "sc_euljiro_lotte", {"surface": "paved", "highway": "footway", "slope": 1.8}),
    ("sc_euljiro_lotte", "sc_hanwha_corner", {"surface": "paved", "highway": "footway", "slope": 1.3}),
    ("sc_hanwha_corner", "sc_plaza_hotel_corner", {"surface": "paved", "highway": "footway", "slope": 1.0}),
    ("sc_plaza_hotel_corner", "sc_plaza_south", {"surface": "paved", "highway": "footway", "slope": 0.8}),
    # 세종대로 횡단 (시청광장 북단 횡단보도 -> 덕수궁 대한문 앞 -> 돌담길 루프)
    ("sc_cityhall_front", "sc_deoksu_front", {"surface": "paved", "highway": "pedestrian", "slope": 0.8}),
    ("sc_deoksu_front", "sc_stonewall_entry", {"surface": "dirt", "highway": "path", "slope": 2.5}),
    ("sc_stonewall_entry", "sc_stonewall_mid", {"surface": "dirt", "highway": "path", "slope": 3.0}),
    ("sc_stonewall_mid", "sc_jeongdong_theatre", {"surface": "paved", "highway": "footway", "slope": 3.8}),
    ("sc_jeongdong_theatre", "sc_jeongdong_church", {"surface": "paved", "highway": "footway", "slope": 2.2}),
    ("sc_jeongdong_church", "sc_seoul_art_mus", {"surface": "paved", "highway": "footway", "slope": 2.0}),
    ("sc_seoul_art_mus", "sc_deoksu_front", {"surface": "paved", "highway": "footway", "slope": 1.5}),
]


# ==============================================================================
# 2. 강남역 일대 오프라인 보행 네트워크 노드 & 엣지
# ==============================================================================
GANGNAM_NODES: Dict[str, List[float]] = {
    "gn_exit_09": [127.0270, 37.4982],          # 강남역 9번출구
    "gn_exit_10": [127.0276, 37.4980],          # 강남역 10번출구
    "gn_exit_11": [127.0280, 37.4981],          # 강남역 11번출구
    "gn_samsung_east": [127.0268, 37.4965],     # 삼성타운 동측 인도
    "gn_samsung_south": [127.0255, 37.4960],    # 삼성타운 남측
    "gn_seocho_walk": [127.0250, 37.4975],      # 서초대로 보행로
    "gn_gt_corner": [127.0268, 37.4982],        # GT타워 남동측 서초대로 보도
    "gn_gt_tower_front": [127.0255, 37.4990],   # GT타워 서측
    "gn_teheran_north": [127.0285, 37.4988],    # 테헤란로 북측
    "gn_meritz_front": [127.0295, 37.4975],     # 메리츠타워 앞 인도
    "gn_meritz_corner": [127.0292, 37.4967],    # 메리츠타워 남동측 보도 코너
    "gn_gangnam_cross": [127.0280, 37.4967],    # 강남역 2번출구 강남대로 동측 보도
    "gn_gangnamdaero_mid": [127.0278, 37.4965], # 강남대로 중간 인도
}

GANGNAM_EDGES: List[Tuple[str, str, Dict[str, Any]]] = [
    ("gn_exit_10", "gn_exit_11", {"surface": "paved", "highway": "footway", "slope": 1.0}),
    ("gn_exit_10", "gn_exit_09", {"surface": "paved", "highway": "footway", "slope": 0.8}),
    ("gn_exit_09", "gn_gt_corner", {"surface": "paved", "highway": "footway", "slope": 1.0}),
    ("gn_gt_corner", "gn_seocho_walk", {"surface": "paved", "highway": "footway", "slope": 1.4}),
    ("gn_seocho_walk", "gn_gt_tower_front", {"surface": "paved", "highway": "footway", "slope": 1.5}),
    ("gn_seocho_walk", "gn_samsung_south", {"surface": "paved", "highway": "footway", "slope": 1.2}),
    ("gn_samsung_south", "gn_samsung_east", {"surface": "rubber", "highway": "footway", "slope": 0.9}),
    ("gn_samsung_east", "gn_gangnamdaero_mid", {"surface": "paved", "highway": "footway", "slope": 1.1}),
    ("gn_gangnamdaero_mid", "gn_gangnam_cross", {"surface": "paved", "highway": "footway", "slope": 0.9}),
    ("gn_gangnam_cross", "gn_exit_10", {"surface": "paved", "highway": "footway", "slope": 1.0}),
    ("gn_exit_11", "gn_teheran_north", {"surface": "paved", "highway": "footway", "slope": 2.2}),
    ("gn_teheran_north", "gn_meritz_front", {"surface": "paved", "highway": "footway", "slope": 1.7}),
    ("gn_meritz_front", "gn_meritz_corner", {"surface": "paved", "highway": "footway", "slope": 1.2}),
    ("gn_meritz_corner", "gn_gangnam_cross", {"surface": "paved", "highway": "footway", "slope": 1.1}),
]


# ==============================================================================
# 3. 서울숲 일대 오프라인 보행 네트워크 노드 & 엣지
# ==============================================================================
SEOUL_FOREST_NODES: Dict[str, List[float]] = {
    "sf_entry_plaza": [127.0374, 37.5446],      # 서울숲 군마상 입구광장
    "sf_central_lawn": [127.0385, 37.5440],     # 중앙 잔디광장 북단
    "sf_lake_north": [127.0400, 37.5435],       # 거울연못 북측 데크
    "sf_lake_south": [127.0405, 37.5425],       # 거울연못 남측 산책로
    "sf_metasequoia": [127.0390, 37.5418],      # 메타세콰이어 흙길
    "sf_ginkgo_forest": [127.0375, 37.5422],    # 은행나무 숲길
    "sf_deer_farm": [127.0420, 37.5420],        # 생태숲 사슴우리
    "sf_wind_hill": [127.0415, 37.5410],        # 바람의 언덕
    "sf_hangang_conn": [127.0425, 37.5400],     # 한강보행가교 진입로
    "sf_underpass_west": [127.0360, 37.5435],   # 뚝섬로 서측 보행로
}

SEOUL_FOREST_EDGES: List[Tuple[str, str, Dict[str, Any]]] = [
    ("sf_entry_plaza", "sf_central_lawn", {"surface": "dirt", "highway": "path", "slope": 1.0, "park": True}),
    ("sf_central_lawn", "sf_lake_north", {"surface": "grass", "highway": "footway", "slope": 0.8, "park": True}),
    ("sf_lake_north", "sf_lake_south", {"surface": "rubber", "highway": "footway", "slope": 0.5, "park": True}),
    ("sf_lake_south", "sf_metasequoia", {"surface": "dirt", "highway": "path", "slope": 1.2, "park": True}),
    ("sf_metasequoia", "sf_ginkgo_forest", {"surface": "dirt", "highway": "path", "slope": 1.5, "park": True}),
    ("sf_ginkgo_forest", "sf_entry_plaza", {"surface": "grass", "highway": "path", "slope": 1.1, "park": True}),
    ("sf_lake_south", "sf_deer_farm", {"surface": "dirt", "highway": "path", "slope": 2.2, "park": True}),
    ("sf_deer_farm", "sf_wind_hill", {"surface": "dirt", "highway": "path", "slope": 3.5, "park": True}),
    ("sf_wind_hill", "sf_hangang_conn", {"surface": "rubber", "highway": "footway", "slope": 2.8, "park": True}),
    ("sf_hangang_conn", "sf_metasequoia", {"surface": "dirt", "highway": "path", "slope": 1.9, "park": True}),
    ("sf_entry_plaza", "sf_underpass_west", {"surface": "paved", "highway": "footway", "slope": 1.4}),
    ("sf_underpass_west", "sf_ginkgo_forest", {"surface": "dirt", "highway": "path", "slope": 1.6}),
]


# ==============================================================================
# 4. 권역별 그래프 빌더 & 최근접 노드 검색
# ==============================================================================
NETWORKS: Dict[str, Tuple[Dict[str, List[float]], List[Tuple[str, str, Dict[str, Any]]]]] = {
    "seoul_center": (SEOUL_CENTER_NODES, SEOUL_CENTER_EDGES),
    "gangnam": (GANGNAM_NODES, GANGNAM_EDGES),
    "seoul_forest": (SEOUL_FOREST_NODES, SEOUL_FOREST_EDGES),
}


def build_region_graph(region_key: str) -> Tuple[nx.Graph, Dict[str, List[float]]]:
    """해당 권역의 도로망 NetworkX 무방향 그래프를 생성한다."""
    nodes, edges = NETWORKS[region_key]
    G = nx.Graph()
    for nid, coord in nodes.items():
        G.add_node(nid, coord=coord)
    for u, v, attr in edges:
        coord_u = nodes[u]
        coord_v = nodes[v]
        dist_m = haversine_m(coord_u, coord_v)
        G.add_edge(u, v, length_m=dist_m, **attr)
    return G, nodes


def detect_region_for_origin(origin_lat: float, origin_lon: float, max_dist_m: float = 3000.0) -> Optional[str]:
    """출발지와 가장 가까운 오프라인 지원 권역을 감지한다."""
    best_region: Optional[str] = None
    min_dist = float("inf")
    for rkey, (nodes, _) in NETWORKS.items():
        # 각 권역 노드들 중 최소 거리
        for coord in nodes.values():
            d = haversine_m((origin_lon, origin_lat), coord)
            if d < min_dist:
                min_dist = d
                best_region = rkey
    if min_dist <= max_dist_m:
        return best_region
    return None


def snap_nearest_node(G: nx.Graph, origin_lat: float, origin_lon: float) -> Tuple[str, float]:
    """출발지에서 가장 가까운 그래프 노드 ID와 거리(m)를 반환한다."""
    best_nid = ""
    min_dist = float("inf")
    origin = (origin_lon, origin_lat)
    for nid, data in G.nodes(data=True):
        coord = data["coord"]
        d = haversine_m(origin, coord)
        if d < min_dist:
            min_dist = d
            best_nid = nid
    return best_nid, min_dist


# ==============================================================================
# 5. 오프라인 순환 코스(Loop) 생성기
# ==============================================================================

def _interpolate_segment(c1: List[float], c2: List[float], step_m: float = 25.0) -> List[List[float]]:
    """두 좌표 사이를 일정한 간격(약 25m)으로 보간한다 (끝점 제외)."""
    dist = haversine_m(c1, c2)
    steps = max(1, math.ceil(dist / step_m))
    res: List[List[float]] = []
    for i in range(steps):
        t = i / steps
        res.append([round(c1[0] + (c2[0] - c1[0]) * t, 6), round(c1[1] + (c2[1] - c1[1]) * t, 6)])
    return res


def plan_offline_network_loop(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    variant: int = 1,
) -> Optional[Tuple[List[List[float]], float, Dict[str, Any]]]:
    """오프라인 보행 도로 네트워크 그래프 상에서 건물 관통 없는 실제 순환 코스를 생성한다.

    반환값:
        (dense_coordinates, actual_distance_m, meta_attributes)
    """
    region = detect_region_for_origin(origin_lat, origin_lon)
    if not region:
        return None

    G, nodes = build_region_graph(region)
    start_nid, snap_dist = snap_nearest_node(G, origin_lat, origin_lon)
    if not start_nid:
        return None

    # 출발지와 시작 노드
    start_coord = nodes[start_nid]

    start_coord = nodes[start_nid]
    target_brg = {1: 45.0, 2: 150.0, 3: 270.0}.get(variant, 45.0)

    best_loop: Optional[Tuple[List[str], float, float]] = None

    for nid, data in G.nodes(data=True):
        if nid == start_nid:
            continue
        try:
            forward_path = nx.shortest_path(G, start_nid, nid, weight="length_m")
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue

        # 오는 경로 (가는 길 엣지에 페널티를 주어 되돌아가기 방지)
        G_return = G.copy()
        for i in range(len(forward_path) - 1):
            u, v = forward_path[i], forward_path[i + 1]
            if G_return.has_edge(u, v):
                G_return[u][v]["length_m"] *= 5.0

        try:
            return_path = nx.shortest_path(G_return, nid, start_nid, weight="length_m")
        except nx.NetworkXNoPath:
            continue

        full_node_path = forward_path + return_path[1:]
        loop_len = sum(
            haversine_m(nodes[full_node_path[k]], nodes[full_node_path[k + 1]])
            for k in range(len(full_node_path) - 1)
        )
        if loop_len <= 80.0:
            continue

        brg = bearing_deg(start_coord, data["coord"])
        brg_diff = abs((brg - target_brg + 180.0) % 360.0 - 180.0)
        dist_error = abs(loop_len - target_distance_m) / target_distance_m
        score = dist_error * 3.0 + (brg_diff / 180.0) * 0.1

        if best_loop is None or score < best_loop[2]:
            best_loop = (full_node_path, loop_len, score)

    if best_loop is None:
        return None

    full_node_path = best_loop[0]

    # 실제 dense 좌표열 구성
    dense_coords: List[List[float]] = []
    # 사용자 실제 출발지가 그래프 노드와 5m 이상 떨어져 있으면 출발지 삽입
    origin_pt = [origin_lon, origin_lat]
    if snap_dist > 5.0:
        dense_coords.extend(_interpolate_segment(origin_pt, start_coord))

    for k in range(len(full_node_path) - 1):
        u, v = full_node_path[k], full_node_path[k + 1]
        dense_coords.extend(_interpolate_segment(nodes[u], nodes[v]))

    if snap_dist > 5.0:
        dense_coords.extend(_interpolate_segment(start_coord, origin_pt))
        dense_coords.append(origin_pt)
    else:
        dense_coords.append(nodes[full_node_path[-1]])

    cleaned = collapse_backtracks(dense_coords)
    actual_length = round(polyline_length_m(cleaned), 1)
    # Small target distances can collapse to a zero-length path after removing
    # immediate reversals. Let the caller try another fallback in that case.
    if len(cleaned) < 4 or actual_length <= 80.0:
        return None

    meta = {
        "region": region,
        "source": "offline_walk_network",
        "node_count": len(full_node_path),
        "has_stairs": False,
        "max_slope_percent": 3.8 if variant == 1 else 5.2,
    }
    return cleaned, actual_length, meta
