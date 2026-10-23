"""Independent, fail-closed validation for every park route returned by the API."""
from functools import lru_cache
import json
import math
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import networkx as nx
from agent.pilot_park_routes import load_pilot_park_polygons, is_route_inside_park_boundary
from agent.route_geometry import haversine_m, polyline_length_m, loop_closure_gap_m, estimate_duration_minutes

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"
MAX_ORIGIN_SNAP_M = 100.0
MAX_DURATION_RATIO = 1.25


class RoutePlanningError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


@lru_cache(maxsize=1)
def load_entry_approaches() -> dict:
    """공원 경계 밖 주차장 → 공원 보행망 진입로 (#160, scripts/build_park_entry_approaches.py 로 만든다)."""
    try:
        data = json.loads((FIXTURES / "park_entry_approaches_pilot.json").read_text(encoding="utf-8"))
        approaches = data.get("approaches") if isinstance(data, dict) else None
        return approaches if isinstance(approaches, dict) else {}
    except (OSError, ValueError):
        return {}


def entry_approach_for(park_id: str, origin: tuple) -> Optional[list]:
    """출발점이 진입로 시작점 근처(MAX_ORIGIN_SNAP_M)인 진입로 좌표열. 없으면 None."""
    for approach in load_entry_approaches().values():
        coords = approach.get("coordinates") if isinstance(approach, dict) else None
        if (approach.get("park_id") == park_id and isinstance(coords, list) and len(coords) >= 2
                and haversine_m(origin, coords[0]) <= MAX_ORIGIN_SNAP_M):
            return [list(point) for point in coords]
    return None


def entry_approach_length_m(park_id: str, coords: list) -> float:
    """경로가 저장된 진입로로 들어갔다 같은 길로 나오면 진입로 편도 길이, 아니면 0."""
    points = [list(p) for p in coords or []]
    for approach in load_entry_approaches().values():
        path = approach.get("coordinates") if isinstance(approach, dict) else None
        if approach.get("park_id") != park_id or not isinstance(path, list) or len(path) < 2:
            continue
        k = len(path)
        if len(points) > 2 * k and points[:k] == path and points[-k:] == list(reversed(path)):
            return polyline_length_m(path)
    return 0.0


def resolve_park_start(graph: nx.Graph, park_id: str, origin: tuple) -> Tuple[tuple, Optional[list]]:
    """공원 경로 시작 노드와 진입로. 보행망에 바로 붙으면 진입로는 None,
    경계 밖 주차장처럼 붙지 못하면 저장된 진입로의 끝(공원 보행망 노드)에서 시작한다."""
    try:
        return snap_park_origin(graph, origin), None
    except RoutePlanningError:
        approach = entry_approach_for(park_id, origin)
        if approach is None or tuple(approach[-1]) not in graph:
            raise
        return tuple(approach[-1]), approach


@lru_cache(maxsize=1)
def load_park_networks() -> dict:
    try:
        data = json.loads((FIXTURES / "park_walk_networks_pilot.json").read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def park_boundary_metadata(park_id: str) -> dict:
    try:
        boundary_data = json.loads((FIXTURES / "park_polygons_pilot.json").read_text(encoding="utf-8"))
        props = next(f["properties"] for f in boundary_data["features"] if f["properties"]["park_id"] == park_id)
        if (props.get("quality") != "verified_osm" or props.get("crs") != "EPSG:4326"
                or not props.get("source", "").startswith("https://www.openstreetmap.org/")
                or int(props.get("source_version", 0)) <= 0):
            raise ValueError("Unverified boundary metadata")
        return props
    except (OSError, ValueError, TypeError, KeyError, StopIteration, AttributeError):
        raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 경계 출처와 버전을 확인할 수 없습니다.")


# cycleway 는 보행망 파일에 넣기로 한 공원(세종, #148)에만 들어 있다. 보행 금지(foot=no)는 아래에서 뺀다
_ALLOWED_HIGHWAYS = {"footway", "pedestrian", "path", "cycleway"}
_DISALLOWED_ACCESS = {"no", "private", "customers", "permit", "delivery", "military"}
_DISALLOWED_FOOT = {"no", "private"}


def _is_walkable_way(tags: Any) -> bool:
    """공원 보행로 태그 유효성 검사."""
    if not isinstance(tags, dict):
        return False
    if tags.get("highway") not in _ALLOWED_HIGHWAYS:
        return False
    if tags.get("access") in _DISALLOWED_ACCESS:
        return False
    return tags.get("foot") not in _DISALLOWED_FOOT


def _add_way_to_graph(graph: nx.Graph, way: Dict[str, Any], park_id: str) -> None:
    """단일 OSM way 의 보행 가능한 선분을 그래프에 추가한다."""
    if not isinstance(way, dict) or not isinstance(way.get("coordinates"), list) or not way.get("way_id"):
        return
    if not _is_walkable_way(way.get("tags")):
        return
    coords = way["coordinates"]
    way_id = way["way_id"]
    for a, b in zip(coords, coords[1:]):
        if a == b or not is_route_inside_park_boundary([a, b], park_id):
            continue
        graph.add_edge(tuple(a), tuple(b), weight=haversine_m(a, b), way_id=way_id)


# 공원 그래프 재사용 (이슈 #125): 요청 하나에서 9번 다시 만들던 것을 한 번만 만든다.
# 그래프는 만든 뒤 읽기만 하므로 공유해도 안전하다. 경계·보행망 데이터 객체가 바뀌면(is 비교) 다시 만든다.
_PARK_GRAPH_CACHE: dict = {}


def build_park_graph(park_id: str) -> nx.Graph:
    boundary = load_pilot_park_polygons().get(park_id)
    if boundary is None or not boundary.is_valid or boundary.is_empty:
        raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 신뢰할 수 있는 경계 데이터가 없습니다.")
    data = load_park_networks().get(park_id)
    if not isinstance(data, dict) or not isinstance(data.get("ways"), list):
        raise RoutePlanningError("WALK_NETWORK_UNAVAILABLE", "선택한 공원의 보행로 데이터를 확인할 수 없습니다.")
    cached = _PARK_GRAPH_CACHE.get(park_id)
    if cached is not None and cached[0] is boundary and cached[1] is data:
        return cached[2]
    graph = nx.Graph()
    for way in data.get("ways", []):
        _add_way_to_graph(graph, way, park_id)
    if not graph.edges:
        raise RoutePlanningError("WALK_NETWORK_UNAVAILABLE", "공원 경계 안에 연결 가능한 보행로가 없습니다.")
    _PARK_GRAPH_CACHE[park_id] = (boundary, data, graph)
    return graph


def snap_park_origin(graph: nx.Graph, origin: tuple) -> tuple:
    nearest = min(graph, key=lambda node: haversine_m(origin, node))
    if haversine_m(origin, nearest) > MAX_ORIGIN_SNAP_M:
        raise RoutePlanningError("ORIGIN_NOT_CONNECTED", "출발점이 공원 내부 보행로에서 멉니다. 공원 진입점을 확인해 주세요.")
    return nearest


def validate_park_route(coords: list, park_id: str, speed_kmh: float, target_minutes: float, origin: tuple = None) -> dict:
    graph = build_park_graph(park_id)
    full_coords, approach, start_origin = coords, None, origin
    if origin is not None:
        _, approach = resolve_park_start(graph, park_id, origin)
    if approach is not None:
        # 진입로는 저장된 것과 똑같아야 하고, 갔던 길로 되돌아와야 한다. 공원 안 순환 부분만 아래 검사를 받는다
        k = len(approach)
        back = list(reversed(approach))
        if len(coords) <= 2 * k or [list(p) for p in coords[:k]] != approach or [list(p) for p in coords[-k:]] != back:
            raise RoutePlanningError("ROUTE_VALIDATION_FAILED", "주차장 진입로가 저장된 보행로와 다릅니다.")
        coords = coords[k - 1:len(coords) - k + 1]
        origin = None
    if not coords or len(coords) < 4 or not is_route_inside_park_boundary(coords, park_id):
        raise RoutePlanningError("ROUTE_VALIDATION_FAILED", "선택한 공원 영역 내에서 안전한 순환 보행로를 생성할 수 없습니다.")
    if loop_closure_gap_m(coords) > 1.0:
        raise RoutePlanningError("NO_VALID_LOOP", "공원 내부에서 출발점으로 돌아오는 경로가 없습니다.")
    # Check full segments against actual allowed edges, never just the vertices.
    # Routes may reverse existing edges, but cannot invent a shortcut between nodes.
    for a, b in zip(coords, coords[1:]):
        if a == b or not graph.has_edge(tuple(a), tuple(b)):
            raise RoutePlanningError("ROUTE_VALIDATION_FAILED", "공원 보행망에 없는 경로 구간이 포함되어 있습니다.")
    if origin is not None and tuple(coords[0]) != snap_park_origin(graph, origin):
        raise RoutePlanningError("ORIGIN_NOT_CONNECTED", "경로 시작점이 지정한 출발점의 보행로와 연결되지 않습니다.")
    if approach is not None and tuple(coords[0]) != tuple(approach[-1]):
        raise RoutePlanningError("ORIGIN_NOT_CONNECTED", "공원 코스가 진입로 끝에서 시작하지 않습니다.")
    if not math.isfinite(speed_kmh) or speed_kmh <= 0 or not math.isfinite(target_minutes) or target_minutes <= 0:
        raise RoutePlanningError("ROUTE_VALIDATION_FAILED", "산책 시간과 속도가 올바르지 않습니다.")
    distance = round(polyline_length_m(coords), 1)
    duration = estimate_duration_minutes(distance, speed_kmh)
    if distance <= 0 or duration > target_minutes * MAX_DURATION_RATIO:
        raise RoutePlanningError("ROUTE_DURATION_OUT_OF_RANGE", "공원 내부 보행로로 목표 산책 시간을 맞출 수 없습니다.")
    properties = park_boundary_metadata(park_id)
    network_data = load_park_networks()[park_id]
    result = {
        "passed": True, "park_id": park_id, "boundary_source": properties["source"],
        "boundary_version": properties["source_version"], "boundary_tolerance_m": 0,
        "walk_network_checked": True, "distance_m": distance, "estimated_minutes": duration,
        "network_source": network_data["source"], "network_retrieved_at": network_data["retrieved_at"],
        "duration_is_alternative": duration < target_minutes * 0.75,
        "snapped_origin": coords[0],
        "origin_snap_m": round(haversine_m(origin, coords[0]), 1) if origin is not None else 0,
        "entry_approach_m": 0,
        "entry_approach_road_m": 0,
    }
    if approach is not None:
        # 거리·시간은 진입로 왕복을 더한 전체 값, 목표 시간 비교는 공원 안 순환 부분만 (#160 가 안)
        total = round(polyline_length_m(full_coords), 1)
        result.update(
            distance_m=total, estimated_minutes=estimate_duration_minutes(total, speed_kmh),
            loop_distance_m=distance, loop_estimated_minutes=duration,
            entry_approach_m=round(polyline_length_m(approach), 1), snapped_origin=full_coords[0],
            # 진입로 중 주택가·이면도로 구간 길이 (#183). 안내 문구에 알린다
            entry_approach_road_m=next((a.get("road_m") or 0 for a in load_entry_approaches().values()
                                        if a.get("coordinates") == approach), 0),
            origin_snap_m=round(haversine_m(start_origin, full_coords[0]), 1),
        )
    return result
