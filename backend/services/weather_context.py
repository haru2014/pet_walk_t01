"""[US-F1] 기상청 예보를 지면열 위험 응답과 에이전트 weather_context 로 바꾸는 어댑터.

- build_heat_risk_response : GET /api/v1/weather/heat-risk 와 같은 모양의 응답
  (status, current, golden_time_window, hourly_forecast, notice, coordinates + 출처 정보)
- build_weather_context    : walk_planning_agent 가 읽는 형식
  (current.estimated_surface_temp / air_temp_celsius, golden_time_window)

지면온도 추정식: 지면온도 = 기온 + (일사 가중치 x 15)
  일사 가중치: 맑음 1.0, 구름많음 0.6, 흐림 0.2, 비·밤 0.0 (밤은 태양 고도 0 이하일 때)
  하늘상태를 알 수 없으면 가장 더운 가정(맑음)을 쓴다.
  일사 가중치는 Open-Meteo 일사량(W/m²) / 1000 (0~1)을 우선 쓰고, 값이 없거나 Open-Meteo 호출이
  실패하면 위의 하늘상태 값을 쓴다 (insolation_source 로 확인, 출처 표기는 attribution).
  insolation_provider 를 직접 주면 그 값이 우선한다.
  Open-Meteo 무료 API 는 비상업 목적만 가능하다 (services/open_meteo_client.py 참고).

골든타임 구간(golden_time_window): 지면온도 35℃ 이하이면서 06~22시인 시간이 이어지는 구간.
  지금 안전하면 지금부터 이어지는 구간, 아니면 앞으로 가장 먼저 시작하는 구간을 고른다.
  구간 문구는 기존 위젯 형식('HH:00 ~ HH:00')을 유지하고, 오늘/내일은 golden_time_window_day 로 알린다.

기상청 호출이 실패하면 가짜 값을 만들지 않고 KmaApiError 를 그대로 올린다.
"""

from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional, Tuple

from services import kma_weather_client as kma
from services import open_meteo_client
from services import airkorea_client
from services.kma_grid_converter import latlon_to_grid

SURFACE_HEAT_GAIN_C = 15.0
SAFE_MAX_C = 35.0      # 이하: SAFE (산책 골든타임)
CAUTION_MAX_C = 45.0   # 이하: CAUTION, 초과: DANGER
INSOLATION_WEIGHTS = {"clear": 1.0, "partly_cloudy": 0.6, "overcast": 0.2, "rainy": 0.0, "night": 0.0}
SKY_CODE_TO_CONDITION = {1: "clear", 3: "partly_cloudy", 4: "overcast"}
GOLDEN_HOURS = range(6, 23)  # 06시~22시 사이만 산책 골든타임 후보
NOTICE = "본 지수는 기상청 예보 모델 기반 추정치입니다."
NO_GOLDEN_WINDOW_TEXT = "일몰 후 (19:00 ~ 22:00) 권장"

InsolationProvider = Callable[[datetime], Optional[float]]


def is_daylight(when: datetime, lat: float, lon: float) -> bool:
    """해당 시각에 태양이 떠 있는지(태양 고도 > 0). 계산이 안 되면 06~19시로 본다."""
    try:
        import importlib
        suncalc = importlib.import_module("suncalc")
        get_position = getattr(suncalc, "get_position")
        return float(get_position(when, lon, lat)["altitude"]) > 0.0
    except (ImportError, AttributeError, ValueError, KeyError, TypeError):
        return 6 <= when.hour < 19


def sky_condition(sky_code: Optional[int], pty_code: Optional[int], daylight: bool) -> str:
    """비(강수형태 0 아님) > 밤 > 하늘상태 순으로 판정한다. 하늘상태를 모르면 맑음(가장 더운 가정)."""
    if pty_code:
        return "rainy"
    if not daylight:
        return "night"
    return SKY_CODE_TO_CONDITION.get(sky_code, "clear")


def estimate_surface_temp(air_temp_c: float, insolation_weight: float) -> float:
    return round(air_temp_c + insolation_weight * SURFACE_HEAT_GAIN_C, 1)


SURFACE_HEAT_GAIN_MAP = {
    "asphalt": 18.0,
    "paved": 14.0,
    "rubber": 12.0,
    "dirt": 8.0,
    "grass": 4.0,
    "gravel": 10.0,
}


def calculate_surface_temps(air_temp_c: float, insolation_weight: float) -> Dict[str, float]:
    """노면 재질별 추정 지면온도 (US-B2 노면 비용 모델 연동)."""
    return {
        surface: round(air_temp_c + insolation_weight * gain, 1)
        for surface, gain in SURFACE_HEAT_GAIN_MAP.items()
    }


def risk_level(surface_temp_c: float) -> str:
    if surface_temp_c <= SAFE_MAX_C:
        return "SAFE"
    return "CAUTION" if surface_temp_c <= CAUTION_MAX_C else "DANGER"


def _entry(when: datetime, air_temp_c: float, sky_code: Optional[int], pty_code: Optional[int],
           lat: float, lon: float, provider: Optional[InsolationProvider],
           pop: Optional[int] = None) -> Dict[str, Any]:
    condition = sky_condition(sky_code, pty_code, is_daylight(when + timedelta(minutes=30), lat, lon))
    weight = INSOLATION_WEIGHTS[condition]
    source = "sky"
    if provider is not None:
        provided = provider(when)
        if provided is not None:
            weight = min(1.0, max(0.0, float(provided)))
            source = "provider"
    surface = estimate_surface_temp(air_temp_c, weight)
    solar_radiation_w_m2 = round(weight * 1000.0, 1)
    surface_temps = calculate_surface_temps(air_temp_c, weight)
    if pop is not None:
        pop_val = int(pop)
    elif pty_code:
        pop_val = 100
    else:
        pop_val = 0

    return {
        "hour": when.hour, "air_temp_celsius": air_temp_c, "estimated_surface_temp": surface,
        "solar_radiation_w_m2": solar_radiation_w_m2,
        "surface_temps": surface_temps,
        "risk_level": risk_level(surface), "is_golden_time": surface <= SAFE_MAX_C, "notice": NOTICE,
        "condition": condition, "insolation_weight": weight, "insolation_source": source,
        "pop": pop_val,
        "time": when.isoformat(),
    }


def _resolve_insolation(lat: float, lon: float, when: datetime, provider: Optional[InsolationProvider],
                        use_open_meteo: bool, timeout: float,
                        warnings: List[str]) -> Tuple[Optional[InsolationProvider], str, Optional[str]]:
    """(일사 제공자, 출처 이름, 출처 표기)를 정한다.

    출처 이름: custom(직접 준 제공자) / open_meteo / sky_fallback(Open-Meteo 실패, 하늘상태로 추정)
    / sky_only(Open-Meteo 사용 안 함)
    """
    if provider is not None:
        return provider, "custom", None
    if not use_open_meteo:
        return None, "sky_only", None
    try:
        radiation = open_meteo_client.fetch_hourly_radiation(lat, lon, when, timeout=timeout)
    except open_meteo_client.OpenMeteoError as exc:
        warnings.append(f"일사량(Open-Meteo)을 가져오지 못해 하늘상태로 추정했습니다 ({exc})")
        return None, "sky_fallback", None
    if not radiation:
        warnings.append("일사량(Open-Meteo) 데이터가 비어 있어 하늘상태로 추정했습니다")
        return None, "sky_fallback", None
    return open_meteo_client.make_insolation_provider(radiation), "open_meteo", open_meteo_client.ATTRIBUTION


def _golden_runs(entries: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """06~22시의 골든타임 시각을 1시간 간격으로 이어지는 구간별로 묶는다."""
    runs: List[List[Dict[str, Any]]] = []
    last_usable: Optional[datetime] = None
    for entry in entries:
        if not (entry["is_golden_time"] and entry["hour"] in GOLDEN_HOURS):
            continue
        when = datetime.fromisoformat(entry["time"])
        if last_usable is not None and when - last_usable == timedelta(hours=1):
            runs[-1].append(entry)
        else:
            runs.append([entry])
        last_usable = when
    return runs


def golden_time_window(entries: List[Dict[str, Any]], now: datetime,
                       current_is_golden: bool) -> Tuple[str, Optional[str]]:
    """(구간 문구, 날짜)를 돌려준다. 문구는 'HH:00 ~ HH:00', 날짜는 'today' / 'tomorrow' / None.

    - 지금 안전(골든타임)이고 지금 시각이 06~22시이면: 지금 시각부터 이어지는 구간
    - 아니면: 앞으로 가장 먼저 시작하는 구간 (내일이면 'tomorrow')
    - 구간이 없으면 기존 안내 문구와 None
    """
    hour_start = now.replace(minute=0, second=0, microsecond=0)
    runs = _golden_runs(entries)
    chosen: Optional[List[Dict[str, Any]]] = None
    if current_is_golden:
        chosen = next((r for r in runs if datetime.fromisoformat(r[0]["time"]) == hour_start), None)
    if chosen is None:
        chosen = next((r for r in runs if datetime.fromisoformat(r[0]["time"]) > hour_start), None)
    if chosen is None:
        return NO_GOLDEN_WINDOW_TEXT, None
    start = datetime.fromisoformat(chosen[0]["time"])
    day = "today" if start.date() == hour_start.date() else "tomorrow"
    return f"{chosen[0]['hour']:02d}:00 ~ {chosen[-1]['hour'] + 1:02d}:00", day


def _slot_time(slot: Dict[str, Any]) -> datetime:
    return datetime.strptime(slot["fcst_date"] + slot["fcst_time"], "%Y%m%d%H%M").replace(tzinfo=kma.KST)


def _apply_forecast_slot(slot: Dict[str, Any], temp_key: str, merged: Dict[datetime, Dict[str, Any]]) -> None:
    values = slot.get("values", {})
    temp = values.get(temp_key)
    if not isinstance(temp, (int, float)):
        return
    t = _slot_time(slot)
    existing = merged.get(t, {})
    pop_val = values.get("POP") if values.get("POP") is not None else existing.get("pop")
    merged[t] = {
        "air": float(temp),
        "sky": values.get("SKY") if values.get("SKY") is not None else existing.get("sky"),
        "pty": values.get("PTY") if values.get("PTY") is not None else existing.get("pty"),
        "pop": int(pop_val) if pop_val is not None else None,
    }


def _merge_forecasts(ultra: Optional[Dict[str, Any]], vilage: Optional[Dict[str, Any]]) -> Dict[datetime, Dict[str, Any]]:
    """시각별 {air, sky, pty, pop}. 단기예보를 깔고 초단기예보(더 최근)로 덮어쓴다."""
    merged: Dict[datetime, Dict[str, Any]] = {}
    for source, temp_key in ((vilage, "TMP"), (ultra, "T1H")):
        for slot in (source or {}).get("forecasts", []):
            _apply_forecast_slot(slot, temp_key, merged)
    return merged


def _optional(fetch: Callable[..., Dict[str, Any]], label: str, warnings: List[str], *args: Any,
              **kwargs: Any) -> Optional[Dict[str, Any]]:
    try:
        return fetch(*args, **kwargs)
    except kma.KmaApiError as exc:
        warnings.append(f"{label}를 가져오지 못했습니다 ({exc})")
        return None


def build_heat_risk_response(lat: float, lon: float, now: Optional[datetime] = None, *,
                             insolation_provider: Optional[InsolationProvider] = None,
                             use_open_meteo: bool = True,
                             service_key: Optional[str] = None,
                             timeout: float = kma.DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """위경도의 현재 기온·예보로 지면열 위험 응답을 만든다. 현재 관측(초단기실황)이 없으면 KmaApiError.

    일사량은 insolation_provider 가 있으면 그것을, 없으면 Open-Meteo 를(use_open_meteo=True),
    Open-Meteo 가 실패하면 하늘상태를 쓴다. 쓴 방식은 응답의 insolation_source 에 적힌다.
    """
    when = kma.to_kst(now)
    nx, ny = latlon_to_grid(lat=lat, lon=lon)
    options = {"now": when, "service_key": service_key, "timeout": timeout}
    warnings: List[str] = []

    observed = kma.fetch_ultra_srt_ncst(nx, ny, **options)
    ultra = _optional(kma.fetch_ultra_srt_fcst, "초단기예보", warnings, nx, ny, **options)
    vilage = _optional(kma.fetch_vilage_fcst, "단기예보", warnings, nx, ny, **options)
    forecasts = _merge_forecasts(ultra, vilage)
    insolation_provider, insolation_source, attribution = _resolve_insolation(
        lat, lon, when, insolation_provider, use_open_meteo, min(timeout, 2.0), warnings)

    hour_start = when.replace(minute=0, second=0, microsecond=0)
    upcoming = sorted(t for t in forecasts if hour_start <= t < hour_start + timedelta(hours=24))
    hourly = [_entry(t, forecasts[t]["air"], forecasts[t]["sky"], forecasts[t]["pty"], lat, lon,
                     insolation_provider, pop=forecasts[t].get("pop")) for t in upcoming]

    values = observed["values"]
    first_forecast = forecasts[upcoming[0]] if upcoming else {}
    air_val = values.get("T1H")
    if isinstance(air_val, (int, float)):
        air_now = float(air_val)
    else:
        air_now = first_forecast.get("air")
    if air_now is None:
        raise kma.KmaApiError("현재 기온을 알 수 없습니다 (관측값과 예보 모두 없음)")

    sky_now = first_forecast.get("sky")
    if values.get("PTY") is not None:
        pty_now = values.get("PTY")
    else:
        pty_now = first_forecast.get("pty")
    pop_now = first_forecast.get("pop")
    current = _entry(when, float(air_now), sky_now, pty_now, lat, lon, insolation_provider, pop=pop_now)
    if hourly and datetime.fromisoformat(hourly[0]["time"]) != hour_start:
        # 매시 45분 이후에는 예보가 다음 시각부터 시작하므로, 현재 시각 슬롯은 현재 관측으로 채운다
        hourly.insert(0, {**current, "time": hour_start.isoformat()})
    window, window_day = golden_time_window(hourly, when, current["is_golden_time"])

    # 한국환경공단 에어코리아(AirKorea) 실시간 대기질(미세먼지) 조회
    air_quality = airkorea_client.fetch_air_quality(lat, lon, service_key=service_key, timeout=min(timeout, 2.5))

    return {
        "status": "success",
        "current": current,
        "pop": current.get("pop", 0),
        "air_quality": air_quality,
        "golden_time_window": window,
        "golden_time_window_day": window_day,
        "hourly_forecast": hourly,
        "notice": NOTICE,
        "coordinates": {"lat": lat, "lon": lon},
        "data_source": "kma_live",
        "insolation_source": insolation_source,
        "attribution": attribution,
        "grid": {"nx": nx, "ny": ny},
        "bases": {
            "ultra_srt_ncst": f"{observed['base_date']} {observed['base_time']}",
            "ultra_srt_fcst": f"{ultra['base_date']} {ultra['base_time']}" if ultra else None,
            "vilage_fcst": f"{vilage['base_date']} {vilage['base_time']}" if vilage else None,
        },
        "warnings": warnings,
    }


def build_open_meteo_heat_risk_response(lat: float, lon: float, now: Optional[datetime] = None, *,
                                        timeout: float = kma.DEFAULT_TIMEOUT_S) -> Dict[str, Any]:
    """기상청 호출이 불가능할 때 Open-Meteo 무키 실시간 예보를 기반으로 정확한 지면열 응답을 생성한다."""
    when = kma.to_kst(now)
    hour_start = when.replace(minute=0, second=0, microsecond=0)

    weather_data = open_meteo_client.fetch_hourly_weather_forecast(lat, lon, when, timeout=timeout)
    radiation_map = {t: d["radiation"] for t, d in weather_data.items()}
    insolation_provider = open_meteo_client.make_insolation_provider(radiation_map)

    upcoming = sorted(t for t in weather_data if hour_start <= t < hour_start + timedelta(hours=24))
    hourly = [
        _entry(
            t,
            weather_data[t]["air"],
            weather_data[t]["sky"],
            weather_data[t]["pty"],
            lat,
            lon,
            insolation_provider,
            pop=weather_data[t]["pop"],
        )
        for t in upcoming
    ]

    curr_data = weather_data.get(hour_start)
    if curr_data is not None:
        current = _entry(
            when,
            curr_data["air"],
            curr_data["sky"],
            curr_data["pty"],
            lat,
            lon,
            insolation_provider,
            pop=curr_data["pop"],
        )
    elif hourly:
        current = hourly[0]
    else:
        raise open_meteo_client.OpenMeteoError("Open-Meteo 예보 데이터가 비어 있습니다.")

    if hourly and datetime.fromisoformat(hourly[0]["time"]) != hour_start:
        hourly.insert(0, {**current, "time": hour_start.isoformat()})

    window, window_day = golden_time_window(hourly, when, current["is_golden_time"])
    air_quality = airkorea_client.fetch_air_quality(lat, lon, timeout=timeout)

    return {
        "status": "success",
        "current": current,
        "pop": current.get("pop", 0),
        "air_quality": air_quality,
        "golden_time_window": window,
        "golden_time_window_day": window_day,
        "hourly_forecast": hourly,
        "notice": NOTICE,
        "coordinates": {"lat": lat, "lon": lon},
        "data_source": "open_meteo_live",
        "insolation_source": "open_meteo",
        "attribution": open_meteo_client.ATTRIBUTION,
        "grid": None,
        "bases": {},
        "warnings": ["기상청 API 대신 Open-Meteo 실시간 기상 관측 데이터를 기반으로 지면열을 산출했습니다."],
    }


RAIN_POP_THRESHOLD = 60  # 기상청 예보 표기 관례: 강수확률 60% 이상이면 비 예보로 본다
PLANNING_FORECAST_HOURS = 12  # 경로 생성에 넘기는 시간대별 예보 수 (현재 시각부터)
_FORECAST_KEYS = ("time", "hour", "air_temp_celsius", "estimated_surface_temp", "risk_level", "is_golden_time",
                  "condition", "pop")


def _upcoming_hours(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """현재 시각부터의 시간대별 예보. 대체 응답(0~23시 고정 곡선, time 없음)은 현재 시각 이후만 고른다."""
    hourly = list(response.get("hourly_forecast") or [])
    if hourly and "time" not in hourly[0]:
        start = (response.get("current") or {}).get("hour", 0)
        hourly = [h for h in hourly if h.get("hour", -1) >= start]
    return hourly[:PLANNING_FORECAST_HOURS]


def _is_rain(entry: Dict[str, Any]) -> bool:
    return entry.get("condition") == "rainy" or (entry.get("pop") or 0) >= RAIN_POP_THRESHOLD


def precipitation_summary(response: Dict[str, Any]) -> Dict[str, Any]:
    """지금 비가 오는지, 강수확률, 6시간 안에 비가 예상되는 시각. 대체 응답이면 known=false (알 수 없음)."""
    current = response.get("current") or {}
    upcoming = _upcoming_hours(response)
    if response.get("data_source") == "fallback_estimate" or "condition" not in current:
        return {"known": False, "is_precipitating_now": None, "pop_now": None, "max_pop_next_3h": None,
                "rain_expected_times": [], "threshold_pop": RAIN_POP_THRESHOLD}
    return {
        "known": True,
        "is_precipitating_now": current.get("condition") == "rainy",
        "pop_now": current.get("pop"),
        "max_pop_next_3h": max((h.get("pop") or 0 for h in upcoming[:3]), default=current.get("pop") or 0),
        "rain_expected_times": [h.get("time") or h.get("hour") for h in upcoming[:6] if _is_rain(h)],
        "threshold_pop": RAIN_POP_THRESHOLD,
    }


def weather_context_from_response(response: Dict[str, Any]) -> Dict[str, Any]:
    """build_heat_risk_response 결과를 walk_planning_agent 의 weather_context 형식으로 줄인다.

    현재값·골든타임에 더해, 비 정보(precipitation)와 앞으로 12시간 예보 요약(forecast_next_hours)을 넘긴다.
    경로 생성·안내 문구가 비 예보와 산책 예정 시각의 날씨를 쓸 수 있게 하기 위해서다.
    """
    return {
        "current": response["current"],
        "golden_time_window": response["golden_time_window"],
        "golden_time_window_day": response["golden_time_window_day"],
        "is_live_estimated": True,
        "data_source": response["data_source"],
        "insolation_source": response["insolation_source"],
        "attribution": response["attribution"],
        "grid": response["grid"],
        "warnings": response["warnings"],
        "precipitation": precipitation_summary(response),
        "forecast_next_hours": [{k: h[k] for k in _FORECAST_KEYS if k in h} for h in _upcoming_hours(response)],
        "air_quality": response.get("air_quality"),
    }


def build_weather_context(lat: float, lon: float, now: Optional[datetime] = None, **kwargs: Any) -> Dict[str, Any]:
    return weather_context_from_response(build_heat_risk_response(lat, lon, now, **kwargs))
