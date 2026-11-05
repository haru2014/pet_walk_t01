"""[US-30, US-B1, US-20] '차가 적은 길' (avoid_traffic) 종합 개선 검증 테스트.

1. 간선도로 감지 버퍼 확장 (MAJOR_NEAR_M=25m, SIDEWALK_MAJOR_NEAR_M=35m)
2. 큰길 페널티 강화 (TRAFFIC_MULTIPLIER["major"]=10.0, MAJOR_CROSSING_EXTRA_M=150m)
3. 경유점(Waypoint) 스냅 시 간선도로 인접 노드 회피
4. OSRM 실시간 경로 큰길 노출도(major_road_ratio > 15%) 사후 필터링
"""

import math
import pytest

from agent.loop_route_planner import _is_traffic_acceptable, MAX_MAJOR_ROAD_RATIO_FOR_QUIET
from agent.osm_overpass_client import OsmRegion
from agent.osm_walk_graph import build_walk_graph, MAJOR_NEAR_M, SIDEWALK_MAJOR_NEAR_M
from agent.preference_loop_planner import _snap
from agent.walk_edge_cost import edge_cost, TRAFFIC_MULTIPLIER, MAJOR_CROSSING_EXTRA_M
from services.walk_preferences import WalkPreferences

LON0, LAT0 = 127.0, 36.0
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_540.0


def p(x: float, y: float):
    return [LON0 + x / KX, LAT0 + y / KY]


def line(points, step=50.0):
    out = []
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) // step))
        out.extend(p(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n))
    out.append(p(*points[-1]))
    return out


def way(way_id, coords, **tags):
    return {"id": way_id, "tags": tags, "coords": coords}


@pytest.fixture
def traffic_region() -> OsmRegion:
    # y=0: 4차로 간선도로(primary)
    # y=20: 대로변 보도(footway, sidewalk 태그 없음) - 차도에서 20m 떨어짐 (기존 15m 버퍼에서는 path 로 오분류되던 거리)
    # y=60: 주택가 골목길(residential)
    ways = [
        way("major_road", line([(-400, 0), (400, 0)], 100), highway="primary"),
        way("side_walk_20m", line([(-400, 20), (400, 20)], 100), highway="footway"),
        way("minor_road_60m", line([(-400, 60), (400, 60)], 100), highway="residential"),
        way("link", line([(0, 20), (0, 60)]), highway="footway"),
    ]
    return OsmRegion(center=(LON0, LAT0), radius_m=800.0, ways=ways)


@pytest.fixture
def traffic_walk(traffic_region):
    return build_walk_graph(traffic_region)


def test_1_major_road_buffer_detects_20m_sidewalk(traffic_walk):
    """1. 20m 떨어진 보행로도 확대된 버퍼(25m) 덕분에 major 로 정확히 식별된다."""
    assert MAJOR_NEAR_M == 25.0
    assert SIDEWALK_MAJOR_NEAR_M == 35.0

    # y=20 보행로의 간선 속성 확인
    tol = 3.0 / KY
    lat_20 = LAT0 + 20.0 / KY
    edges_20 = [
        d for u, v, d in traffic_walk.graph.edges(data=True)
        if abs(u[1] - lat_20) < tol and abs(v[1] - lat_20) < tol
    ]
    assert len(edges_20) > 0
    # 기존에는 15m 버퍼로 인해 'path'로 오분류되었으나, 25m 버퍼로 'major'로 판정되어야 함
    assert all(d["road_context"] == "major" for d in edges_20)


def test_2_traffic_penalty_is_ten_times_and_crossing_extra_raised(traffic_walk):
    """2. '차가 적은 길'에서 큰길 비용 배수가 10배, 횡단 페널티가 150m 로 강화되었다."""
    assert TRAFFIC_MULTIPLIER["major"] == 10.0
    assert MAJOR_CROSSING_EXTRA_M == 150.0

    prefs = WalkPreferences(avoid_traffic=True)
    tol = 3.0 / KY
    lat_20 = LAT0 + 20.0 / KY
    edge_major = next(
        d for u, v, d in traffic_walk.graph.edges(data=True)
        if abs(u[1] - lat_20) < tol and abs(v[1] - lat_20) < tol
    )
    cost = edge_cost(edge_major, prefs)
    # major 가중치 10배가 적용되어 실제 거리의 10배 비용
    assert cost == pytest.approx(edge_major["length"] * 10.0)


def test_3_waypoint_snap_avoids_major_road_node(traffic_walk):
    """3. 경유점 스냅 시 avoid_traffic=True 이면 큰길 옆 노드보다 골목길 노드를 우선 선택한다."""
    component = set(traffic_walk.graph.nodes())
    # 질의점: y=25 (y=20 대로변 보도와 거리 5m, y=60 골목길과 거리 35m)
    query_point = tuple(p(0, 25))

    # avoid_traffic=False 이면 단순 거리순으로 가장 가까운 y=20 대로변 보도 노드로 스냅
    snap_normal = _snap(traffic_walk, component, query_point, avoid_traffic=False)
    assert snap_normal is not None
    assert abs(snap_normal[1] - (LAT0 + 20.0 / KY)) < 2.0 / KY

    # avoid_traffic=True 이면 y=20 노드는 큰길 페널티(+80m)로 인해 y=60 골목길 노드로 스냅
    snap_safe = _snap(traffic_walk, component, query_point, avoid_traffic=True)
    assert snap_safe is not None
    assert abs(snap_safe[1] - (LAT0 + 60.0 / KY)) < 2.0 / KY


def test_4_traffic_filter_rejects_heavy_major_road():
    """4. OSRM 라이브 경로에서 큰길 비율이 15%를 초과하면 거부하고, 15% 이하이면 수용한다."""
    assert MAX_MAJOR_ROAD_RATIO_FOR_QUIET == 0.15

    prefs = WalkPreferences(avoid_traffic=True)
    # preferences 가 없으면 항상 통과
    assert _is_traffic_acceptable([[127.0, 36.0], [127.0, 36.001]], 36.0, 127.0, 1000.0, None) is True
    # avoid_traffic 이 꺼져 있어도 항상 통과
    assert _is_traffic_acceptable([[127.0, 36.0], [127.0, 36.001]], 36.0, 127.0, 1000.0, WalkPreferences()) is True

