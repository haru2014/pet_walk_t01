"""[US-F1] Open-Meteo 시간별 일사량 클라이언트와 일사 가중치 변환.

기상청 단기예보에는 일사량이 없어 Open-Meteo 의 shortwave_radiation 을 쓴다.

- 엔드포인트: https://api.open-meteo.com/v1/forecast (OPEN_METEO_BASE_URL 로 변경 가능)
- shortwave_radiation 은 **직전 1시간의 평균**(W/m²)이다. 즉 13:00 으로 표시된 값은
  12:00~13:00 구간의 평균이므로, 12시 구간(12:00~13:00)의 일사량은 13:00 항목을 쓴다.
- 이용 조건 (공식 약관 확인): 데이터는 CC BY 4.0 (출처 표기 필요), 무료 API 는
  **비상업 목적만** 가능하며 분당 600회, 시간당 5,000회, 하루 10,000회 이하,
  무료 사용에는 API 키가 필요 없다. 상업적으로 쓰려면 유료 구독이 필요하다.
  이 프로젝트(편안하개)는 과제 제출용 비상업 목적이라 무료 이용 조건에 해당한다.
  앱을 상업적으로 배포하거나 광고·구독을 붙이게 되면 유료 구독으로 바꿔야 한다.
- 일사 가중치 = 일사량(W/m²) / 1000 을 0~1 로 제한한다.
"""

import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Mapping, Optional, Tuple

from services.http_util import ssl_context
from services.kma_weather_client import to_kst

ENV_BASE_URL = "OPEN_METEO_BASE_URL"
DEFAULT_BASE_URL = "https://api.open-meteo.com/v1/forecast"
DEFAULT_TIMEOUT_S = 5.0
CACHE_TTL_S = 1800.0  # 예보는 시간 단위로 갱신되므로 30분 캐시로 호출 한도를 아낀다
MAX_RADIATION_W_M2 = 1000.0
ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)"

InsolationProvider = Callable[[datetime], Optional[float]]
_CACHE: Dict[Tuple, Tuple[float, Dict[datetime, float]]] = {}
_FORECAST_CACHE: Dict[Tuple, Tuple[float, Dict[datetime, Dict[str, Any]]]] = {}


class OpenMeteoError(Exception):
    """Open-Meteo 호출 또는 응답 해석 실패."""


def clear_cache() -> None:
    _CACHE.clear()
    _FORECAST_CACHE.clear()


def _http_get(url: str, timeout: float) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-student-project/1.0"})
    with urllib.request.urlopen(request, timeout=timeout, context=ssl_context()) as response:
        return response.read().decode("utf-8", errors="replace")


def _finite(name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} 는 유한한 숫자여야 합니다: {value!r}")
    return float(value)


def radiation_to_weight(radiation_w_m2: float) -> float:
    """일사량(W/m²)을 0~1 일사 가중치로 바꾼다 (1000 W/m² 이상은 1.0)."""
    return min(1.0, max(0.0, radiation_w_m2 / MAX_RADIATION_W_M2))


def fetch_hourly_radiation(lat: float, lon: float, now: Optional[datetime] = None, *,
                           timeout: float = DEFAULT_TIMEOUT_S,
                           forecast_days: int = 2) -> Dict[datetime, float]:
    """시간별 shortwave_radiation(W/m²)을 {표시 시각: 값} 으로 돌려준다.

    표시 시각은 '직전 1시간 평균'의 끝 시각이다. 값이 없는(null) 시각은 빼고,
    같은 위치(소수점 2자리, 약 1km)와 같은 날짜의 요청은 30분 동안 캐시한다.
    """
    lat, lon = _finite("lat", lat), _finite("lon", lon)
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError(f"좌표 범위를 벗어났습니다: lat={lat}, lon={lon}")
    today = to_kst(now).strftime("%Y%m%d")
    cache_key = (round(lat, 2), round(lon, 2), today, forecast_days)
    cached = _CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_S:
        return cached[1]

    query = urllib.parse.urlencode({
        "latitude": lat, "longitude": lon, "hourly": "shortwave_radiation",
        "timezone": "Asia/Seoul", "forecast_days": forecast_days,
    })
    base = (os.getenv(ENV_BASE_URL) or DEFAULT_BASE_URL).rstrip("/")
    try:
        text = _http_get(f"{base}?{query}", timeout)
    except urllib.error.HTTPError as exc:
        raise OpenMeteoError(f"Open-Meteo HTTP 오류 {exc.code}") from None
    except OSError as exc:
        raise OpenMeteoError(f"Open-Meteo 연결 실패 ({type(exc).__name__})") from None

    radiation = _parse(text)
    _CACHE[cache_key] = (time.monotonic(), radiation)
    return radiation


def _parse(text: str) -> Dict[datetime, float]:
    try:
        payload = json.loads(text)
        if payload.get("error"):
            raise OpenMeteoError(f"Open-Meteo 오류: {str(payload.get('reason', ''))[:100]}")
        offset = timezone(timedelta(seconds=int(payload.get("utc_offset_seconds", 32400))))
        times, values = payload["hourly"]["time"], payload["hourly"]["shortwave_radiation"]
        parsed: Dict[datetime, float] = {}
        for stamp, value in zip(times, values):
            if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
                parsed[datetime.fromisoformat(stamp).replace(tzinfo=offset)] = float(value)
        return parsed
    except OpenMeteoError:
        raise
    except (ValueError, KeyError, TypeError, AttributeError):
        raise OpenMeteoError("해석할 수 없는 Open-Meteo 응답") from None


def make_insolation_provider(radiation: Mapping[datetime, float]) -> InsolationProvider:
    """시간별 일사량으로 '구간 시작 시각 -> 0~1 일사 가중치' 함수를 만든다.

    구간 [H, H+1시간)의 값은 '직전 1시간 평균'이 H+1시간으로 표시된 항목이다.
    해당 항목이 없으면 None 을 돌려주어 호출 측이 다른 방법(하늘상태)을 쓰게 한다.
    """
    def provider(slot_start: datetime) -> Optional[float]:
        hour_start = to_kst(slot_start).replace(minute=0, second=0, microsecond=0)
        value = radiation.get(hour_start + timedelta(hours=1))
        return None if value is None else radiation_to_weight(value)

    return provider


def wmo_code_to_sky_pty(code: int) -> Tuple[int, int]:
    """WMO weather_code -> (sky, pty).
    sky: 1(맑음), 3(구름많음), 4(흐림)
    pty: 0(없음), 1(비), 2(비/눈), 3(눈), 4(소나기)
    """
    if code in (0,):
        return 1, 0  # 맑음
    if code in (1, 2):
        return 3, 0  # 구름많음
    if code in (3, 45, 48):
        return 4, 0  # 흐림/안개
    if code in (51, 53, 55, 61, 63, 65, 80, 81, 82):
        return 4, 1  # 비
    if code in (66, 67):
        return 4, 2  # 진눈깨비
    if code in (71, 73, 75, 77, 85, 86):
        return 4, 3  # 눈
    if code in (95, 96, 99):
        return 4, 4  # 뇌우/소나기
    return 1, 0


def _parse_hourly_forecast(payload: Dict[str, Any]) -> Dict[datetime, Dict[str, Any]]:
    """시간별 날씨 예보 응답 JSON을 구조화된 딕셔너리로 변환한다."""
    offset = timezone(timedelta(seconds=int(payload.get("utc_offset_seconds", 32400))))
    hourly = payload["hourly"]
    times = hourly["time"]
    temps = hourly["temperature_2m"]
    rads = hourly["shortwave_radiation"]
    pops = hourly.get("precipitation_probability", [0] * len(times))
    codes = hourly.get("weather_code", [0] * len(times))

    parsed: Dict[datetime, Dict[str, Any]] = {}
    for stamp, temp, rad, pop, code in zip(times, temps, rads, pops, codes):
        t = datetime.fromisoformat(stamp).replace(tzinfo=offset)
        sky, pty = wmo_code_to_sky_pty(int(code) if code is not None else 0)
        parsed[t] = {
            "air": float(temp) if temp is not None else 20.0,
            "radiation": float(rad) if rad is not None else 0.0,
            "sky": sky,
            "pty": pty,
            "pop": int(pop) if pop is not None else 0,
        }
    return parsed


def fetch_hourly_weather_forecast(
    lat: float, lon: float, now: Optional[datetime] = None, *,
    timeout: float = DEFAULT_TIMEOUT_S,
    forecast_days: int = 2
) -> Dict[datetime, Dict[str, Any]]:
    """시간별 종합 날씨 {시각: {air, radiation, sky, pty, pop}}를 조회한다 (무키 Open-Meteo 실시간 연동)."""
    lat, lon = _finite("lat", lat), _finite("lon", lon)
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise ValueError(f"좌표 범위를 벗어났습니다: lat={lat}, lon={lon}")

    today = to_kst(now).strftime("%Y%m%d%H")
    cache_key = (round(lat, 2), round(lon, 2), today, forecast_days)
    cached = _FORECAST_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < CACHE_TTL_S:
        return cached[1]

    query = urllib.parse.urlencode({
        "latitude": lat,
        "longitude": lon,
        "hourly": "temperature_2m,shortwave_radiation,precipitation_probability,weather_code",
        "timezone": "Asia/Seoul",
        "forecast_days": forecast_days,
    })
    base = (os.getenv(ENV_BASE_URL) or DEFAULT_BASE_URL).rstrip("/")
    try:
        text = _http_get(f"{base}?{query}", timeout)
    except urllib.error.HTTPError as exc:
        raise OpenMeteoError(f"Open-Meteo HTTP 오류 {exc.code}") from None
    except OSError as exc:
        raise OpenMeteoError(f"Open-Meteo 연결 실패 ({type(exc).__name__})") from None

    try:
        payload = json.loads(text)
        if payload.get("error"):
            raise OpenMeteoError(f"Open-Meteo 오류: {str(payload.get('reason', ''))[:100]}")

        parsed = _parse_hourly_forecast(payload)
        _FORECAST_CACHE[cache_key] = (time.monotonic(), parsed)
        return parsed
    except OpenMeteoError:
        raise
    except (ValueError, KeyError, TypeError, AttributeError):
        raise OpenMeteoError("해석할 수 없는 Open-Meteo 응답") from None
