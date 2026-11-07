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
# 반경 1.8km 도심은 길만 수천 개라 공개 서버가 4초 안에 못 줄 때가 많다. 전체 8초 안에서 서버마다 최대 6초 기다리고,
# 첫 서버가 느리면 남은 시간으로 다음 서버를 시도한다. (앱 요청 제한 20초 = 이 조회 8초 + OSRM 6초 + 여유)
TIMEOUT_S = 8.0
MIRROR_TIMEOUT_S = 6.0
CACHE_TTL_S = 3600.0
# 실패도 잠깐 기억한다. 한 요청 안에서 후보 3개·지표 계산이 같은 지역을 다시 받으려 하면 실패할 때마다 10초씩 쌓여
# 앱 제한 시간(20초)을 넘기기 때문이다. 짧게만 기억해 서버가 회복되면 곧 다시 시도한다.
FAILURE_TTL_S = 30.0
CACHE_MAX = 32
M_PER_DEG_LAT = 110_540.0
SOURCE = "OpenStreetMap Overpass API (ODbL)"

QUERY_TEMPLATE = """[out:json][timeout:9];
(
  way["highway"]({bbox});
  node["highway"="crossing"]({bbox});
  node["amenity"~"^(bench|shelter|drinking_water|toilets)$"]({bbox});
  node["leisure"="picnic_table"]({bbox});
  way["leisure"~"^(park|garden)$"]({bbox});
  way["landuse"~"^(commercial|retail|forest)$"]({bbox});
  way["natural"~"^(wood|tree_row)$"]({bbox});
);
out geom qt;"""


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


RegionKey = Tuple[float, float, int]

_CACHE: Dict[RegionKey, Tuple[float, OsmRegion]] = {}
_FAILED: Dict[RegionKey, float] = {}
# 지금 받고 있는 지역. 같은 지역을 찾는 다른 요청은 여기에 걸려 기다렸다가 캐시를 함께 쓴다.
_INFLIGHT: Dict[RegionKey, threading.Event] = {}
_LOCK = threading.Lock()  # 사전을 읽고 쓰는 동안만 짧게 잡는다 (외부 조회 중에는 잡지 않는다)


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


def _download(query: str, total_s: float = TIMEOUT_S) -> Optional[Dict[str, Any]]:
    """서버를 차례로 시도하되 전체 대기 시간은 total_s, 서버 하나당은 MIRROR_TIMEOUT_S 를 넘지 않는다."""
    body = urllib.parse.urlencode({"data": query}).encode("utf-8")
    deadline = time.monotonic() + total_s
    for url in MIRRORS:
        remaining = deadline - time.monotonic()
        if remaining < 1.0:
            break
        try:
            req = urllib.request.Request(url, data=body, headers={"User-Agent": "PetWalk/1.0"})
            with urllib.request.urlopen(req, timeout=min(remaining, MIRROR_TIMEOUT_S), context=ssl_context()) as res:
                return json.loads(res.read().decode("utf-8"))
        except Exception as exc:  # 네트워크·응답 형식 오류는 다음 서버로
            logger.warning("Overpass 조회 실패(%s): %s", url, type(exc).__name__)
    return None


def _remembered(key: RegionKey) -> Tuple[bool, Optional[OsmRegion]]:
    """(기억해 둔 결과가 있는가, 그 자료). 실패를 기억한 경우에는 (True, None). 호출자가 _LOCK 을 잡는다."""
    now = time.monotonic()
    cached = _CACHE.get(key)
    if cached and now - cached[0] < CACHE_TTL_S:
        return True, cached[1]
    failed_at = _FAILED.get(key)
    if failed_at is not None and now - failed_at < FAILURE_TTL_S:
        return True, None
    return False, None


def _download_region(key: RegionKey, lat: float, lon: float, radius_m: float,
                     total_s: float) -> Optional[OsmRegion]:
    """자료를 받아 기억해 둔다. 받는 동안에는 _LOCK 을 잡지 않는다 (다른 지역 조회를 막지 않도록)."""
    south, west, north, east = bbox_for(lat, lon, radius_m)
    query = QUERY_TEMPLATE.format(bbox=f"{south:.6f},{west:.6f},{north:.6f},{east:.6f}")
    payload = _download(query, total_s)
    region = None if payload is None else parse_overpass(payload, (lon, lat), radius_m)
    with _LOCK:
        if region is None:
            _FAILED[key] = time.monotonic()
            return None
        _FAILED.pop(key, None)
        if len(_CACHE) >= CACHE_MAX:
            _CACHE.clear()
        _CACHE[key] = (time.monotonic(), region)
    return region


def fetch_region(lat: float, lon: float, radius_m: float,
                 budget_s: Optional[float] = None) -> Optional[OsmRegion]:
    """출발지 주변 OSM 자료. 실패하거나 꺼져 있거나 쓸 시간이 없으면 None.

    같은 지역을 이미 받고 있으면 새로 받지 않고 그 결과를 함께 쓴다. 조건을 바꿀 때마다 앱이 보내는
    사전 요청(프리페치)이 겹쳐도 조회는 한 번만 일어나 대기 시간이 쌓이지 않는다.
    budget_s 를 주면 그 시간 안에서만 조회한다 (요청 전체 예산: services/request_budget.py).
    """
    if not routing_enabled():
        return None
    total_s = TIMEOUT_S if budget_s is None else min(TIMEOUT_S, budget_s)
    key = (round(lat, 3), round(lon, 3), int(radius_m // 200))
    while True:
        with _LOCK:
            remembered, region = _remembered(key)
            if remembered:
                return region
            if total_s <= 0.0:  # 앞 단계가 시간을 다 썼다 → 조회하지 않고 OSRM 경로로 넘긴다
                return None
            running = _INFLIGHT.get(key)
            if running is None:
                _INFLIGHT[key] = threading.Event()
                break
        if not running.wait(total_s):  # 앞선 조회가 끝나기를 기다린다 (지나치게 기다리지는 않는다)
            return None
    try:
        return _download_region(key, lat, lon, radius_m, total_s)
    finally:
        with _LOCK:
            finished = _INFLIGHT.pop(key, None)
        if finished is not None:
            finished.set()


def clear_region_cache() -> None:
    _CACHE.clear()
    _FAILED.clear()
