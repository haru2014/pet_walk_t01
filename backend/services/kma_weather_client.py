"""[US-F1] 기상청 단기예보 조회서비스 호출 클라이언트 (초단기실황 / 초단기예보).

- 인증키는 환경변수 KMA_SERVICE_KEY (공공데이터포털 Decoding 키)에서만 읽는다.
  키는 오류 메시지·로그에 절대 넣지 않는다.
- 호출 주소는 환경변수 KMA_API_BASE_URL 로 바꿀 수 있다 (기본: 공공데이터포털 주소).
  주의: 2026-09-28 활용가이드는 서비스 URL 을 apihub.kma.go.kr (authKey 방식)으로 안내한다.
  기본 주소는 2026-10-13 에 정상 응답(resultCode 00)을 확인했으나, 이관 가능성이 있으므로
  주소가 막히면 이 값을 확인할 것.
- 발표 시각 규칙 (공식 활용가이드):
  초단기실황  base_time 매 정시(HH00),  정시 10분 이후 호출 가능
  초단기예보  base_time 매시 30분(HH30), 매시 45분 이후 호출 가능
  단기예보    base_time 0200 0500 0800 1100 1400 1700 2000 2300 (하루 8회), 각각 10분 이후 호출 가능
- 응답 값 중 절댓값 900 이상은 결측(Missing)이므로 None 으로 바꾼다.
"""

import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from services.http_util import ssl_context as _ssl_context
from services.kma_grid_converter import latlon_to_grid

KST = timezone(timedelta(hours=9))  # 한국 표준시 (일광절약시간 없음)

ENV_SERVICE_KEY = "KMA_SERVICE_KEY"
ENV_BASE_URL = "KMA_API_BASE_URL"
DEFAULT_BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0"
DEFAULT_TIMEOUT_S = 5.0

OP_ULTRA_SRT_NCST = "getUltraSrtNcst"  # 초단기실황
OP_ULTRA_SRT_FCST = "getUltraSrtFcst"  # 초단기예보
OP_VILAGE_FCST = "getVilageFcst"  # 단기예보
VILAGE_BASE_HOURS = (2, 5, 8, 11, 14, 17, 20, 23)  # 단기예보 발표 시각 (하루 8회), 정시 10분 이후 호출 가능

CACHE_TTL_S = 600.0  # 기상청 자료는 10분마다 갱신된다
_MISSING_LIMIT = 900.0
_INT_CATEGORIES = {"SKY", "PTY", "REH", "VEC", "POP"}

_CACHE: Dict[Tuple, Tuple[float, List[Dict[str, Any]]]] = {}


class KmaApiError(Exception):
    """기상청 호출 실패. code 는 기상청 resultCode (없으면 None)."""

    def __init__(self, message: str, code: Optional[str] = None):
        super().__init__(message)
        self.code = code


def clear_cache() -> None:
    _CACHE.clear()


def _to_kst(now: Optional[datetime]) -> datetime:
    if now is None:
        return datetime.now(KST)
    return now.astimezone(KST) if now.tzinfo else now.replace(tzinfo=KST)


to_kst = _to_kst  # 다른 모듈(어댑터 등)이 쓰는 공개 이름


def latest_ultra_srt_ncst_base(now: Optional[datetime] = None) -> Tuple[str, str]:
    """지금 조회 가능한 가장 최근 초단기실황 (base_date, base_time)."""
    t = _to_kst(now) - timedelta(minutes=10)
    return t.strftime("%Y%m%d"), t.strftime("%H00")


def latest_ultra_srt_fcst_base(now: Optional[datetime] = None) -> Tuple[str, str]:
    """지금 조회 가능한 가장 최근 초단기예보 (base_date, base_time). 발표는 HH:30, 제공은 HH:45 이후."""
    t = _to_kst(now) - timedelta(minutes=15)
    if t.minute < 30:
        t -= timedelta(hours=1)
    return t.strftime("%Y%m%d"), t.strftime("%H30")


def latest_vilage_fcst_base(now: Optional[datetime] = None) -> Tuple[str, str]:
    """지금 조회 가능한 가장 최근 단기예보 (base_date, base_time). 02시 10분 이전에는 전날 23시 발표분."""
    t = _to_kst(now) - timedelta(minutes=10)
    available = [h for h in VILAGE_BASE_HOURS if h <= t.hour]
    if available:
        return t.strftime("%Y%m%d"), f"{max(available):02d}00"
    return (t - timedelta(days=1)).strftime("%Y%m%d"), "2300"


def _parse_value(category: str, raw: Any) -> Any:
    """응답 값을 숫자로 바꾼다. 결측은 None, 숫자가 아닌 범주 문자열은 그대로 둔다."""
    try:
        number = float(raw)
    except (TypeError, ValueError):
        return raw
    if not math.isfinite(number) or abs(number) >= _MISSING_LIMIT:
        return None
    return int(round(number)) if category in _INT_CATEGORIES else number


def _http_get(url: str, timeout: float) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "PetWalk/1.0"})
    with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _call(operation: str, params: Dict[str, Any], service_key: Optional[str],
          timeout: float) -> List[Dict[str, Any]]:
    key = service_key or os.getenv(ENV_SERVICE_KEY)
    if not key:
        raise KmaApiError(f"{ENV_SERVICE_KEY} 가 설정되지 않았습니다 (backend/.env 확인)")

    cache_key = (operation, tuple(sorted(params.items())))
    cached = _CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_S:
        return cached[1]

    base = (os.getenv(ENV_BASE_URL) or DEFAULT_BASE_URL).rstrip("/")
    query = urllib.parse.urlencode({"serviceKey": key, "dataType": "JSON", **params})
    try:
        text = _http_get(f"{base}/{operation}?{query}", timeout)
    except urllib.error.HTTPError as exc:
        raise KmaApiError(f"기상청 HTTP 오류 {exc.code}") from None
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise KmaApiError(f"기상청 서버 연결 실패 ({type(exc).__name__})") from None

    try:
        response = json.loads(text)["response"]
        header = response["header"]
    except (ValueError, KeyError, TypeError):
        snippet = text[:200].replace(key, "***").replace("\n", " ")
        raise KmaApiError(f"해석할 수 없는 응답: {snippet}") from None
    if header.get("resultCode") != "00":
        raise KmaApiError(f"{header.get('resultCode')} {header.get('resultMsg')}", header.get("resultCode"))

    items = (response.get("body") or {}).get("items") or {}
    item_list = items.get("item", []) if isinstance(items, dict) else []
    if isinstance(item_list, dict):
        item_list = [item_list]
    _CACHE[cache_key] = (time.monotonic(), item_list)
    return item_list


def fetch_ultra_srt_ncst(nx: int, ny: int, *, now: Optional[datetime] = None,
                         service_key: Optional[str] = None,
                         timeout: float = DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """초단기실황: 격자 (nx, ny)의 현재 관측값. values 에 T1H(기온) 등이 들어 있다."""
    base_date, base_time = latest_ultra_srt_ncst_base(now)
    params = {"pageNo": 1, "numOfRows": 20, "base_date": base_date,
              "base_time": base_time, "nx": nx, "ny": ny}
    items = _call(OP_ULTRA_SRT_NCST, params, service_key, timeout)
    values = {i["category"]: _parse_value(i["category"], i.get("obsrValue")) for i in items}
    return {"base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny, "values": values}


def fetch_ultra_srt_fcst(nx: int, ny: int, *, now: Optional[datetime] = None,
                         service_key: Optional[str] = None,
                         timeout: float = DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """초단기예보: 격자 (nx, ny)의 앞으로 6시간 예보. 시각별 values 에 T1H, SKY(하늘상태) 등."""
    base_date, base_time = latest_ultra_srt_fcst_base(now)
    params = {"pageNo": 1, "numOfRows": 100, "base_date": base_date,
              "base_time": base_time, "nx": nx, "ny": ny}
    items = _call(OP_ULTRA_SRT_FCST, params, service_key, timeout)
    return {"base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny,
            "forecasts": _group_forecasts(items)}


def _group_forecasts(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """예보 항목을 (예보일자, 예보시각)별로 묶어 시간순으로 돌려준다."""
    grouped: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for i in items:
        slot = grouped.setdefault((i["fcstDate"], i["fcstTime"]), {})
        slot[i["category"]] = _parse_value(i["category"], i.get("fcstValue"))
    return [{"fcst_date": d, "fcst_time": t, "values": v} for (d, t), v in sorted(grouped.items())]


def fetch_vilage_fcst(nx: int, ny: int, *, now: Optional[datetime] = None,
                      service_key: Optional[str] = None,
                      timeout: float = DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """단기예보: 격자 (nx, ny)의 앞으로 며칠간 시간별 예보. values 에 TMP(기온), SKY, PTY 등."""
    base_date, base_time = latest_vilage_fcst_base(now)
    params = {"pageNo": 1, "numOfRows": 1000, "base_date": base_date,
              "base_time": base_time, "nx": nx, "ny": ny}
    items = _call(OP_VILAGE_FCST, params, service_key, timeout)
    return {"base_date": base_date, "base_time": base_time, "nx": nx, "ny": ny,
            "forecasts": _group_forecasts(items)}


def fetch_current_weather_at(lat: float, lon: float, **kwargs: Any) -> Dict[str, Any]:
    """위도/경도로 바로 현재 관측값을 조회한다 (내부에서 격자로 변환)."""
    nx, ny = latlon_to_grid(lat=lat, lon=lon)
    return fetch_ultra_srt_ncst(nx, ny, **kwargs)
