"""[편안하개 - PetWalk]
한국환경공단 에어코리아(AirKorea) 실시간 대기질(미세먼지) 클라이언트

1. 공공데이터포털 에어코리아 대기오염정보 API 연동 (AIRKOREA_SERVICE_KEY 또는 KMA_SERVICE_KEY)
2. 위경도 기반 시도(대전, 세종, 서울 등) 측정소 실시간 PM10/PM2.5 수치 및 등급(좋음/보통/나쁨/매우나쁨) 조회
3. 키 부재 또는 장애 시 Open-Meteo Air Quality 실시간 API 무중단 자동 폴백
4. 30분 메모리 TTL 캐싱으로 공공데이터 호출 한도 및 응답 속도 최적화
"""

import json
import logging
import os
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from services.http_util import ssl_context

logger = logging.getLogger(__name__)

ENV_AIRKOREA_KEY = "AIRKOREA_SERVICE_KEY"
ENV_KMA_KEY = "KMA_SERVICE_KEY"
DEFAULT_AIRKOREA_URL = "https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getCtprvnRltmMesureDnsty"
OPEN_METEO_AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
DEFAULT_TIMEOUT_S = 4.0
CACHE_TTL_S = 1800.0  # 30분 캐시

_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}


def clear_cache() -> None:
    _CACHE.clear()


def resolve_sido_name(lat: float, lon: float) -> str:
    """위경도 좌표로 시도명 판별 (파일럿 거점 우선)."""
    if 36.45 <= lat <= 36.7 and 127.1 <= lon <= 127.4:
        return "세종"
    if 36.1 <= lat < 36.45 and 127.2 <= lon <= 127.6:
        return "대전"
    if 37.4 <= lat <= 37.7 and 126.8 <= lon <= 127.2:
        return "서울"
    if 35.0 <= lat <= 35.4 and 128.9 <= lon <= 129.3:
        return "부산"
    if 35.7 <= lat <= 36.0 and 128.4 <= lon <= 128.8:
        return "대구"
    return "대전"


def pm10_to_grade_label(pm10: Optional[float]) -> str:
    """환경부 PM10 기준 (0~30 좋음, 31~80 보통, 81~150 나쁨, 151~ 매우나쁨)."""
    if pm10 is None:
        return "보통"
    if pm10 <= 30:
        return "좋음"
    if pm10 <= 80:
        return "보통"
    if pm10 <= 150:
        return "나쁨"
    return "매우나쁨"


def pm25_to_grade_label(pm25: Optional[float]) -> str:
    """환경부 PM2.5 기준 (0~15 좋음, 16~35 보통, 36~75 나쁨, 76~ 매우나쁨)."""
    if pm25 is None:
        return "보통"
    if pm25 <= 15:
        return "좋음"
    if pm25 <= 35:
        return "보통"
    if pm25 <= 75:
        return "나쁨"
    return "매우나쁨"


def fetch_open_meteo_air_quality(lat: float, lon: float, timeout: float = DEFAULT_TIMEOUT_S) -> Optional[Dict[str, Any]]:
    """Open-Meteo Air Quality 실시간 API로 미세먼지 폴백 조회 (무료, 인증키 불필요)."""
    try:
        url = (
            f"{OPEN_METEO_AIR_URL}?latitude={lat:.4f}&longitude={lon:.4f}"
            "&current=pm10,pm2_5,european_aqi&timezone=Asia%2FSeoul"
        )
        request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-app/1.0"})
        with urllib.request.urlopen(request, timeout=timeout, context=ssl_context()) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            current = data.get("current", {})
            pm10 = current.get("pm10")
            pm25 = current.get("pm2_5")
            if pm10 is not None:
                pm10_val = round(float(pm10), 1)
                pm25_val = round(float(pm25), 1) if pm25 is not None else None
                label = pm10_to_grade_label(pm10_val)
                return {
                    "pm10": pm10_val,
                    "pm25": pm25_val,
                    "grade_label": label,
                    "station_name": "Open-Meteo 실시간 대기질",
                    "data_source": "open_meteo",
                }
    except Exception as exc:
        logger.debug("Open-Meteo 대기질 폴백 조회 실패: %s", exc)
    return None


def fetch_air_quality(
    lat: float,
    lon: float,
    service_key: Optional[str] = None,
    timeout: float = DEFAULT_TIMEOUT_S,
) -> Dict[str, Any]:
    """위경도 좌표 기준 실시간 대기질 정보 조회 (에어코리아 -> Open-Meteo -> 기본값 순 폴백)."""
    sido = resolve_sido_name(lat, lon)
    cache_key = f"{sido}_{round(lat, 2)}_{round(lon, 2)}"
    cached = _CACHE.get(cache_key)
    if cached is not None and time.time() - cached[0] < CACHE_TTL_S:
        return cached[1]

    key = service_key or os.environ.get(ENV_AIRKOREA_KEY) or os.environ.get(ENV_KMA_KEY)

    # 1. 에어코리아 공공데이터 API 시도
    if key and key.strip():
        try:
            # 공공데이터포털 일반 인증키(Encoding/Decoding) 모두 지원하도록 unquote 후 urlencode
            clean_key = urllib.parse.unquote(key.strip())
            params = {
                "serviceKey": clean_key,
                "returnType": "json",
                "numOfRows": "50",
                "pageNo": "1",
                "sidoName": sido,
                "ver": "1.0",
            }
            query = urllib.parse.urlencode(params)
            url = f"{DEFAULT_AIRKOREA_URL}?{query}"
            request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-app/1.0"})
            with urllib.request.urlopen(request, timeout=timeout, context=ssl_context()) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                body = data.get("response", {}).get("body", {})
                items = body.get("items", [])
                for item in items:
                    pm10_str = item.get("pm10Value")
                    pm25_str = item.get("pm25Value")
                    if pm10_str and pm10_str not in ("-", "통신장애"):
                        try:
                            pm10_val = float(pm10_str)
                            pm25_val = float(pm25_str) if pm25_str and pm25_str != "-" else None
                            grade_label = pm10_to_grade_label(pm10_val)
                            result = {
                                "pm10": pm10_val,
                                "pm25": pm25_val,
                                "grade_label": grade_label,
                                "station_name": item.get("stationName", f"{sido} 측정소"),
                                "data_source": "airkorea",
                            }
                            _CACHE[cache_key] = (time.time(), result)
                            return result
                        except (ValueError, TypeError):
                            continue
        except Exception as exc:
            logger.info("에어코리아 API 조회 실패 (%s), Open-Meteo 대기질 폴백 시도", exc)

    # 2. Open-Meteo 실시간 대기질 폴백 시도
    om_result = fetch_open_meteo_air_quality(lat, lon, timeout)
    if om_result:
        _CACHE[cache_key] = (time.time(), om_result)
        return om_result

    # 3. 최종 안심 기본값
    fallback = {
        "pm10": 25.0,
        "pm25": 14.0,
        "grade_label": "좋음",
        "station_name": f"{sido} 기준",
        "data_source": "estimated",
    }
    _CACHE[cache_key] = (time.time(), fallback)
    return fallback
