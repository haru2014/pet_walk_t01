"""[US-B1, US-B3, US-20] 출발지 주변 OSM 보행 자료를 Overpass API 로 받는다.

받는 자료 (출발지 중심 반경 안):
- 길: way[highway] (보행로·차도 모두. 차도는 '차도 옆' 판단에 쓴다)
- 횡단 지점: node[highway=crossing]
- 쉼터: node[amenity=bench|shelter|drinking_water|toilets], node[leisure=picnic_table]
- 공원: way[leisure=park|garden] / 상업지: way[landuse=commercial|retail]
- 그늘: way[natural=wood|tree_row], way[landuse=forest]

공개 Overpass 서버를 쓰므로 같은 지역은 캐시에서 다시 쓴다(1시간). 실패하면 None 을 돌려주고
호출자는 기존 OSRM 경로로 돌아가며 '조건을 확인하지 못했다'고 알린다(GEMINI.md 원칙 8).
환경변수 OSM_GRAPH_ROUTING=0 이면 받지 않는다 (테스트·오프라인 시연).
"""

import json
import logging
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from services.http_util import ssl_context

logger = logging.getLogger(__name__)

MIRRORS = ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter")
TIMEOUT_S = 4.0
CACHE_TTL_S = 3600.0
CACHE_MAX = 32
M_PER_DEG_LAT = 110_540.0
SOURCE = "OpenStreetMap Overpass API (ODbL)"

QUERY_TEMPLATE = """[out:json][timeout:8];
(
  way["highway"]({bbox});
  node["highway"="crossing"]({bbox});
  node["amenity"~"^(bench|shelter|drinking_water|toilets)$"]({bbox});
  node["leisure"="picnic_table"]({bbox});
  way["leisure"~"^(park|garden)$"]({bbox});
  way["landuse"~"^(commercial|retail|forest)$"]({bbox});
  way["natural"~"^(wood|tree_row)$"]({bbox});
);
out geom;"""


@dataclass
class OsmRegion:
    """출발지 주변 OSM 자료. 좌표는 모두 [경도, 위도]."""
    center: Tuple[float, float]
    radius_m: float
    ways: List[Dict[str, Any]] = field(default_factory=list)          # {"id", "tags", "coords"}
    crossings: List[List[float]] = field(default_factory=list)
    rest_points: List[List[float]] = field(default_factory=list)
    parks: List[List[List[float]]] = field(default_factory=list)
    commercial: List[List[List[float]]] = field(default_factory=list)
    shade_areas: List[List[List[float]]] = field(default_factory=list)
    shade_lines: List[List[List[float]]] = field(default_factory=list)
    osm_base: Optional[str] = None


_CACHE: Dict[Tuple[float, float, int], Tuple[float, OsmRegion]] = {}
_LOCK = threading.Lock()


def routing_enabled() -> bool:
    return os.environ.get("OSM_GRAPH_ROUTING", "1") != "0"


def region_radius_m(target_distance_m: float) -> float:
    """순환 코스가 들어갈 반경. 둘레 = 목표 거리로 보고 지름에 여유 400m 를 더한다 (600~1800m)."""
    return max(600.0, min(1800.0, target_distance_m / 3.14 + 400.0))


def bbox_for(lat: float, lon: float, radius_m: float) -> Tuple[float, float, float, float]:
    d_lat = radius_m / M_PER_DEG_LAT
    d_lon = radius_m / (111_320.0 * math.cos(math.radians(lat)))
    return lat - d_lat, lon - d_lon, lat + d_lat, lon + d_lon


def _geometry(element: Dict[str, Any]) -> List[List[float]]:
    return [[p["lon"], p["lat"]] for p in element.get("geometry") or [] if "lon" in p and "lat" in p]


def _sort_way(region: OsmRegion, element: Dict[str, Any]) -> None:
    tags = element.get("tags") or {}
    coords = _geometry(element)
    if len(coords) < 2:
        return
    if "highway" in tags:
        region.ways.append({"id": str(element.get("id")), "tags": tags, "coords": coords})
    if tags.get("leisure") in ("park", "garden"):
        region.parks.append(coords)
    if tags.get("landuse") in ("commercial", "retail"):
        region.commercial.append(coords)
    if tags.get("natural") == "wood" or tags.get("landuse") == "forest":
        region.shade_areas.append(coords)
    if tags.get("natural") == "tree_row":
        region.shade_lines.append(coords)


def _sort_node(region: OsmRegion, element: Dict[str, Any]) -> None:
    tags = element.get("tags") or {}
    point = [element.get("lon"), element.get("lat")]
    if None in point:
        return
    if tags.get("highway") == "crossing":
        region.crossings.append(point)
    if tags.get("amenity") in ("bench", "shelter", "drinking_water", "toilets") or tags.get("leisure") == "picnic_table":
        region.rest_points.append(point)


def parse_overpass(payload: Dict[str, Any], center: Tuple[float, float], radius_m: float) -> OsmRegion:
    """Overpass JSON(out geom) → OsmRegion."""
    region = OsmRegion(center=center, radius_m=radius_m, osm_base=(payload.get("osm3s") or {}).get("timestamp_osm_base"))
    for element in payload.get("elements") or []:
        if element.get("type") == "way":
            _sort_way(region, element)
        elif element.get("type") == "node":
            _sort_node(region, element)
    return region


def _download(query: str) -> Optional[Dict[str, Any]]:
    """서버를 차례로 시도하되 전체 대기 시간은 TIMEOUT_S 를 넘지 않는다 (경로 생성 시간 예산 보호)."""
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    deadline = time.monotonic() + TIMEOUT_S
    for url in MIRRORS:
        remaining = deadline - time.monotonic()
        if remaining < 1.0:
            break
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "PetWalk/1.0"})
            with urllib.request.urlopen(req, timeout=remaining, context=ssl_context()) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as exc:  # 네트워크·응답 형식 오류는 다음 서버로
            logger.warning("Overpass 조회 실패(%s): %s", url, type(exc).__name__)
    return None


def fetch_region(lat: float, lon: float, radius_m: float) -> Optional[OsmRegion]:
    """출발지 주변 OSM 자료. 실패하거나 꺼져 있으면 None."""
    if not routing_enabled():
        return None
    key = (round(lat, 3), round(lon, 3), int(radius_m // 200))
    with _LOCK:
        cached = _CACHE.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_S:
            return cached[1]
        south, west, north, east = bbox_for(lat, lon, radius_m)
        payload = _download(QUERY_TEMPLATE.format(bbox=f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}"))
        if payload is None:
            return None
        region = parse_overpass(payload, (lon, lat), radius_m)
        if len(_CACHE) >= CACHE_MAX:
            _CACHE.clear()
        _CACHE[key] = (time.monotonic(), region)
        return region


def clear_region_cache() -> None:
    _CACHE.clear()
