"""[US-B1, US-B3, US-20] 출발지 주변 OSM 보행 자료를 Overpass API 로 받는다.

무엇을 받고 어떻게 정리하는지는 agent/osm_region 에 있다 (질의문 QUERY_TEMPLATE·OsmRegion·parse_overpass).
이 모듈은 받아 오는 일만 맡는다: 공개 서버 두 곳, 1시간 캐시, 같은 지역 동시 조회 합치기, 시간 예산.

실패하면 None 을 돌려주고 호출자는 기존 OSRM 경로로 돌아가며
'조건을 확인하지 못했다'고 알린다(GEMINI.md 원칙 8).
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
from typing import Any, Dict, Optional, Tuple

from agent.osm_region import QUERY_TEMPLATE, SOURCE, OsmRegion, parse_overpass
from services.http_util import ssl_context

__all__ = [
    "QUERY_TEMPLATE", "SOURCE", "OsmRegion", "parse_overpass",
    "bbox_for", "clear_region_cache", "fetch_region", "region_radius_m", "routing_enabled",
]

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
