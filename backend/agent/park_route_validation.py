"""Independent, fail-closed validation for every park route returned by the API."""
from functools import lru_cache
import json
import math
from pathlib import Path

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


_ALLOWED_HIGHWAYS = {"footway", "pedestrian", "path"}
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


def build_park_graph(park_id: str) -> nx.Graph:
    boundary = load_pilot_park_polygons().get(park_id)
    if boundary is None or not boundary.is_valid or boundary.is_empty:
        raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 신뢰할 수 있는 경계 데이터가 없습니다.")
    data = load_park_networks().get(park_id)
    if not isinstance(data, dict) or not isinstance(data.get("ways"), list):
        raise RoutePlanningError("WALK_NETWORK_UNAVAILABLE", "선택한 공원의 보행로 데이터를 확인할 수 없습니다.")
    graph = nx.Graph()
    for way in data.get("ways", []):
        _add_way_to_graph(graph, way, park_id)
    if not graph.edges:
        raise RoutePlanningError("WALK_NETWORK_UNAVAILABLE", "공원 경계 안에 연결 가능한 보행로가 없습니다.")
    return graph


def snap_park_origin(graph: nx.Graph, origin: tuple) -> tuple:
    nearest = min(graph, key=lambda node: haversine_m(origin, node))
    if haversine_m(origin, nearest) > MAX_ORIGIN_SNAP_M:
        raise RoutePlanningError("ORIGIN_NOT_CONNECTED", "출발점이 공원 내부 보행로에서 멉니다. 공원 진입점을 확인해 주세요.")
    return nearest


def validate_park_route(coords: list, park_id: str, speed_kmh: float, target_minutes: float, origin: tuple = None) -> dict:
    graph = build_park_graph(park_id)
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
    if not math.isfinite(speed_kmh) or speed_kmh <= 0 or not math.isfinite(target_minutes) or target_minutes <= 0:
        raise RoutePlanningError("ROUTE_VALIDATION_FAILED", "산책 시간과 속도가 올바르지 않습니다.")
    distance = round(polyline_length_m(coords), 1)
    duration = estimate_duration_minutes(distance, speed_kmh)
    if distance <= 0 or duration > target_minutes * MAX_DURATION_RATIO:
        raise RoutePlanningError("ROUTE_DURATION_OUT_OF_RANGE", "공원 내부 보행로로 목표 산책 시간을 맞출 수 없습니다.")
    properties = park_boundary_metadata(park_id)
    network_data = load_park_networks()[park_id]
    return {
        "passed": True, "park_id": park_id, "boundary_source": properties["source"],
        "boundary_version": properties["source_version"], "boundary_tolerance_m": 0,
        "walk_network_checked": True, "distance_m": distance, "estimated_minutes": duration,
        "network_source": network_data["source"], "network_retrieved_at": network_data["retrieved_at"],
        "duration_is_alternative": duration < target_minutes * 0.75,
        "snapped_origin": coords[0],
        "origin_snap_m": round(haversine_m(origin, coords[0]), 1) if origin is not None else 0,
    }
