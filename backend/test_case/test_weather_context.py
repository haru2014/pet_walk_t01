"""[US-F1] 기상청 예보 -> 지면열 위험 응답 / 에이전트 weather_context 어댑터 TDD 테스트.

네트워크 없이 가짜 기상청 응답(_http_get 교체)으로 검증한다.
1. 순수 함수: 하늘상태 판정, 지면온도 추정, 위험 등급 경계, 골든타임 구간.
2. 응답 조립: 비·밤·맑음·하늘상태 결측, 예보 병합, 일사량 제공자 덮어쓰기.
3. 장애 처리: 현재 관측 실패는 오류, 예보 실패는 경고와 함께 계속.
4. 형식: 기존 /weather/heat-risk 응답 키와 에이전트가 읽는 키.
"""

import json
import re
import urllib.error
import urllib.parse
from datetime import datetime, timedelta

import pytest

from services import kma_weather_client as kma
from services import weather_context as wc
from services.kma_weather_client import KST, KmaApiError

NOW = datetime(2026, 10, 13, 12, 20, tzinfo=KST)  # 낮 12시 20분
DOAN = (36.3458, 127.3428)  # 도안호수공원 임시 주차장 부근 (기상청 격자 67,100)


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    kma.clear_cache()
    monkeypatch.setenv(kma.ENV_SERVICE_KEY, "TESTKEY")
    monkeypatch.delenv(kma.ENV_BASE_URL, raising=False)
    yield
    kma.clear_cache()


def _ok(items):
    return json.dumps({"response": {"header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
                                    "body": {"items": {"item": items}}}})


def _ncst(t1h=16.7, pty=0):
    items = [{"category": "PTY", "obsrValue": str(pty)}]
    if t1h is not None:
        items.append({"category": "T1H", "obsrValue": str(t1h)})
    return items


def _fcst(slots, temp_key):
    """slots: [(datetime, temp, sky, pty)] -> 예보 항목 목록. sky 가 None 이면 SKY 항목을 뺀다."""
    items = []
    for when, temp, sky, pty in slots:
        base = {"fcstDate": when.strftime("%Y%m%d"), "fcstTime": when.strftime("%H%M")}
        items.append({**base, "category": temp_key, "fcstValue": str(temp)})
        items.append({**base, "category": "PTY", "fcstValue": str(pty)})
        if sky is not None:
            items.append({**base, "category": "SKY", "fcstValue": str(sky)})
    return items


def _hours(start, count, temp=20.0, sky=1, pty=0):
    return [(start + timedelta(hours=i), temp, sky, pty) for i in range(count)]


def _server(monkeypatch, ncst=None, ultra=None, vilage=None):
    """기능별 가짜 응답. Exception 을 주면 그 예외를 낸다."""
    responses = {"getUltraSrtNcst": ncst, "getUltraSrtFcst": ultra, "getVilageFcst": vilage}
    calls = []

    def fake(url, timeout):
        op = urllib.parse.urlparse(url).path.rsplit("/", 1)[-1]
        calls.append(op)
        value = responses[op]
        if isinstance(value, Exception):
            raise value
        return _ok(value if value is not None else [])

    monkeypatch.setattr(kma, "_http_get", fake)
    return calls


def _default_server(monkeypatch, t1h=16.7, pty=0, sky=1, now=NOW):
    start = now.replace(minute=0, second=0, microsecond=0)
    return _server(monkeypatch, ncst=_ncst(t1h, pty),
                   ultra=_fcst(_hours(start, 6, temp=t1h, sky=sky, pty=pty), "T1H"),
                   vilage=_fcst(_hours(start, 30, temp=t1h, sky=sky, pty=pty), "TMP"))


class TestPureFunctions:
    @pytest.mark.parametrize("sky, pty, daylight, expected", [
        (1, 0, True, "clear"), (3, 0, True, "partly_cloudy"), (4, 0, True, "overcast"),
        (None, None, True, "clear"), (7, 0, True, "clear"),
        (1, 1, True, "rainy"), (1, 4, False, "rainy"), (1, 0, False, "night"),
    ])
    def test_sky_condition(self, sky, pty, daylight, expected):
        assert wc.sky_condition(sky, pty, daylight) == expected

    @pytest.mark.parametrize("air, weight, expected", [
        (30.0, 1.0, 45.0), (28.5, 0.6, 37.5), (16.7, 0.0, 16.7), (20.04, 0.2, 23.0),
    ])
    def test_estimate_surface_temp(self, air, weight, expected):
        assert wc.estimate_surface_temp(air, weight) == expected

    @pytest.mark.parametrize("temp, expected", [
        (20.0, "SAFE"), (35.0, "SAFE"), (35.1, "CAUTION"), (45.0, "CAUTION"), (45.1, "DANGER"),
    ])
    def test_risk_level_boundaries(self, temp, expected):
        assert wc.risk_level(temp) == expected

    def test_daylight_at_noon_and_midnight_in_daejeon(self):
        assert wc.is_daylight(datetime(2026, 10, 13, 12, 0, tzinfo=KST), *DOAN) is True
        assert wc.is_daylight(datetime(2026, 10, 13, 0, 0, tzinfo=KST), *DOAN) is False

    def test_daylight_fallback_when_sun_calculation_fails(self, monkeypatch):
        import suncalc
        monkeypatch.setattr(suncalc, "get_position", lambda *a, **k: (_ for _ in ()).throw(ValueError("x")))
        assert wc.is_daylight(datetime(2026, 10, 13, 12, 0, tzinfo=KST), *DOAN) is True
        assert wc.is_daylight(datetime(2026, 10, 13, 22, 0, tzinfo=KST), *DOAN) is False


def _slots(now, golden, count=24):
    """now 가 속한 시각부터 count 시간치 항목. golden(datetime) 이 True 인 시각이 안전 시간."""
    first = now.replace(minute=0, second=0, microsecond=0)
    times = [first + timedelta(hours=i) for i in range(count)]
    return [{"hour": t.hour, "is_golden_time": golden(t), "time": t.isoformat()} for t in times]


def _at(hours, day_offset=0):
    """(오늘 + day_offset 일)의 hours 시각들을 안전 시간으로 보는 판정 함수."""
    return lambda t: (t.date() - datetime(2026, 10, 13).date()).days == day_offset and t.hour in hours


class TestGoldenTimeWindow:
    def _either_day(self, today, tomorrow=()):
        return lambda t: _at(today)(t) or _at(tomorrow, 1)(t)

    def test_safe_now_shows_the_run_that_contains_now_not_tomorrow_morning(self):
        """이전 문제: 밤 19시에 이미 안전한데 내일 아침 '06:00 ~ 13:00'이 나오던 경우."""
        now = datetime(2026, 10, 13, 19, 20, tzinfo=KST)
        entries = _slots(now, self._either_day({19, 20, 21, 22}, set(range(6, 13))))
        assert wc.golden_time_window(entries, now, current_is_golden=True) == ("19:00 ~ 23:00", "today")

    def test_safe_now_in_the_middle_of_the_day_starts_from_now(self):
        now = datetime(2026, 10, 13, 12, 20, tzinfo=KST)
        entries = _slots(now, _at(set(range(6, 23))))
        assert wc.golden_time_window(entries, now, True) == ("12:00 ~ 23:00", "today")

    def test_not_safe_now_shows_the_next_run_today(self):
        now = datetime(2026, 10, 13, 14, 20, tzinfo=KST)
        entries = _slots(now, self._either_day({19, 20, 21, 22}, set(range(6, 10))))
        assert wc.golden_time_window(entries, now, current_is_golden=False) == ("19:00 ~ 23:00", "today")

    def test_not_safe_now_and_nothing_left_today_points_to_tomorrow(self):
        now = datetime(2026, 10, 13, 14, 20, tzinfo=KST)
        entries = _slots(now, _at(set(range(6, 10)), day_offset=1))
        assert wc.golden_time_window(entries, now, False) == ("06:00 ~ 10:00", "tomorrow")

    def test_safe_but_outside_candidate_hours_points_to_the_next_run(self):
        now = datetime(2026, 10, 13, 23, 20, tzinfo=KST)  # 23시는 후보 시간대(06~22시) 밖
        entries = _slots(now, lambda t: True)
        assert wc.golden_time_window(entries, now, True) == ("06:00 ~ 23:00", "tomorrow")

    def test_gap_ends_the_current_run(self):
        now = datetime(2026, 10, 13, 8, 20, tzinfo=KST)
        entries = _slots(now, _at({8, 9, 11, 12}))
        assert wc.golden_time_window(entries, now, True) == ("08:00 ~ 10:00", "today")

    def test_hours_outside_six_to_twenty_two_are_ignored(self):
        now = datetime(2026, 10, 13, 0, 20, tzinfo=KST)
        entries = _slots(now, _at({1, 2, 3, 4, 5, 23}))
        assert wc.golden_time_window(entries, now, True) == (wc.NO_GOLDEN_WINDOW_TEXT, None)

    def test_run_ending_at_22_is_allowed(self):
        now = datetime(2026, 10, 13, 20, 20, tzinfo=KST)
        entries = _slots(now, _at({21, 22}))
        assert wc.golden_time_window(entries, now, False) == ("21:00 ~ 23:00", "today")

    def test_no_safe_hours_uses_fallback_text_and_no_day(self):
        now = datetime(2026, 10, 13, 12, 20, tzinfo=KST)
        assert wc.golden_time_window(_slots(now, lambda t: False), now, False) == (wc.NO_GOLDEN_WINDOW_TEXT, None)
        assert wc.golden_time_window([], now, False) == (wc.NO_GOLDEN_WINDOW_TEXT, None)

    def test_current_flag_without_a_matching_slot_falls_back_to_the_next_run(self):
        """현재 시각 항목이 예보에 없으면(예보 실패 등) 지금 구간을 만들지 않고 다음 구간을 쓴다."""
        now = datetime(2026, 10, 13, 12, 20, tzinfo=KST)
        entries = [e for e in _slots(now, _at(set(range(6, 23)))) if e["hour"] != 12]
        assert wc.golden_time_window(entries, now, True) == ("13:00 ~ 23:00", "today")

    def test_window_text_keeps_the_format_the_widget_parses(self):
        now = datetime(2026, 10, 13, 12, 20, tzinfo=KST)
        text, _ = wc.golden_time_window(_slots(now, _at(set(range(6, 23)))), now, True)
        start, end = [part.strip() for part in text.split("~")]
        assert re.fullmatch(r"\d\d:00", start) and re.fullmatch(r"\d\d:00", end)
        assert int(end[:2]) > int(start[:2])  # 위젯의 진행 막대 계산(끝 - 시작 > 0)이 가능


class TestBuildResponse:
    def test_rainy_day_has_no_solar_heating(self, monkeypatch):
        _default_server(monkeypatch, t1h=16.7, pty=1)
        current = wc.build_heat_risk_response(*DOAN, now=NOW)["current"]
        assert current["condition"] == "rainy" and current["insolation_weight"] == 0.0
        assert current["estimated_surface_temp"] == 16.7 and current["risk_level"] == "SAFE"
        assert current["is_golden_time"] is True

    def test_hot_clear_day_is_caution_then_danger(self, monkeypatch):
        _default_server(monkeypatch, t1h=30.0)
        current = wc.build_heat_risk_response(*DOAN, now=NOW)["current"]
        assert (current["condition"], current["estimated_surface_temp"], current["risk_level"]) == ("clear", 45.0, "CAUTION")
        kma.clear_cache()
        _default_server(monkeypatch, t1h=31.0)
        current = wc.build_heat_risk_response(*DOAN, now=NOW)["current"]
        assert (current["estimated_surface_temp"], current["risk_level"], current["is_golden_time"]) == (46.0, "DANGER", False)

    def test_night_has_no_solar_heating(self, monkeypatch):
        night = datetime(2026, 10, 13, 23, 20, tzinfo=KST)
        _default_server(monkeypatch, t1h=25.0, now=night)
        current = wc.build_heat_risk_response(*DOAN, now=night)["current"]
        assert current["condition"] == "night" and current["estimated_surface_temp"] == 25.0

    def test_missing_sky_assumes_clear_hottest_case(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=_ncst(28.0), ultra=_fcst([(start, 28.0, None, 0)], "T1H"),
                vilage=urllib.error.URLError("down"))
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["current"]["condition"] == "clear" and response["current"]["estimated_surface_temp"] == 43.0

    def test_hourly_forecast_is_sorted_and_within_24_hours(self, monkeypatch):
        _default_server(monkeypatch)
        hourly = wc.build_heat_risk_response(*DOAN, now=NOW)["hourly_forecast"]
        times = [datetime.fromisoformat(h["time"]) for h in hourly]
        assert times == sorted(times) and len(hourly) == 24
        assert times[0] == NOW.replace(minute=0) and times[-1] < NOW.replace(minute=0) + timedelta(hours=24)

    def test_ultra_forecast_overrides_short_term_forecast(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=_ncst(20.0),
                ultra=_fcst([(start, 25.0, 4, 0)], "T1H"),
                vilage=_fcst([(start, 20.0, 1, 0), (start + timedelta(hours=1), 21.0, 1, 0)], "TMP"))
        hourly = wc.build_heat_risk_response(*DOAN, now=NOW)["hourly_forecast"]
        assert hourly[0]["air_temp_celsius"] == 25.0 and hourly[0]["condition"] == "overcast"
        assert hourly[1]["air_temp_celsius"] == 21.0  # 초단기예보에 없는 시각은 단기예보 값

    def test_response_keeps_the_existing_endpoint_contract(self, monkeypatch):
        _default_server(monkeypatch)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert {"status", "current", "golden_time_window", "hourly_forecast", "notice", "coordinates"} <= set(response)
        assert response["golden_time_window_day"] in ("today", "tomorrow", None)
        needed = {"hour", "air_temp_celsius", "estimated_surface_temp", "risk_level", "is_golden_time", "notice"}
        assert needed <= set(response["current"])
        assert all(needed <= set(h) for h in response["hourly_forecast"])
        assert response["status"] == "success" and response["coordinates"] == {"lat": DOAN[0], "lon": DOAN[1]}
        assert re.fullmatch(r"\d\d:00 ~ \d\d:00", response["golden_time_window"]) or \
            response["golden_time_window"] == wc.NO_GOLDEN_WINDOW_TEXT
        assert response["notice"] == "본 지수는 기상청 예보 모델 기반 추정치입니다."

    def test_cool_day_window_starts_from_now(self, monkeypatch):
        _default_server(monkeypatch, t1h=16.7)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["current"]["is_golden_time"] is True
        assert (response["golden_time_window"], response["golden_time_window_day"]) == ("12:00 ~ 23:00", "today")

    def test_hot_day_window_is_the_evening_after_sunset(self, monkeypatch):
        """낮에는 지면 46℃(위험), 해가 지면 가열이 0 이 되어 안전해지므로 저녁 구간을 권장한다."""
        _default_server(monkeypatch, t1h=31.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["current"]["is_golden_time"] is False
        start, end = [p.strip() for p in response["golden_time_window"].split("~")]
        assert end == "23:00" and 17 <= int(start[:2]) <= 19
        assert response["golden_time_window_day"] == "today"

    def test_night_now_window_starts_now_not_tomorrow_morning(self, monkeypatch):
        night = datetime(2026, 10, 13, 19, 20, tzinfo=KST)
        _default_server(monkeypatch, t1h=13.2, now=night)
        response = wc.build_heat_risk_response(*DOAN, now=night)
        assert response["current"]["is_golden_time"] is True
        assert (response["golden_time_window"], response["golden_time_window_day"]) == ("19:00 ~ 23:00", "today")

    def test_source_information(self, monkeypatch):
        _default_server(monkeypatch)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["data_source"] == "kma_live" and response["grid"] == {"nx": 67, "ny": 100}
        assert response["bases"] == {"ultra_srt_ncst": "20261013 1200", "ultra_srt_fcst": "20261013 1130",
                                     "vilage_fcst": "20261013 1100"}
        assert response["warnings"] == []

    def test_insolation_provider_overrides_sky_based_weight(self, monkeypatch):
        _default_server(monkeypatch, t1h=30.0)
        cloudy = wc.build_heat_risk_response(*DOAN, now=NOW, insolation_provider=lambda t: 0.0)
        assert cloudy["current"]["estimated_surface_temp"] == 30.0
        kma.clear_cache()
        _default_server(monkeypatch, t1h=30.0)
        clamped = wc.build_heat_risk_response(*DOAN, now=NOW, insolation_provider=lambda t: 2.0)
        assert clamped["current"]["insolation_weight"] == 1.0
        kma.clear_cache()
        _default_server(monkeypatch, t1h=30.0)
        fallback = wc.build_heat_risk_response(*DOAN, now=NOW, insolation_provider=lambda t: None)
        assert fallback["current"]["insolation_weight"] == 1.0  # 맑음 기본값

    def test_out_of_domain_location_raises_before_any_call(self, monkeypatch):
        calls = _default_server(monkeypatch)
        with pytest.raises(ValueError):
            wc.build_heat_risk_response(35.68, 139.69, now=NOW)  # 도쿄
        assert calls == []


class TestFailureHandling:
    def test_observation_failure_raises_instead_of_inventing_data(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=urllib.error.URLError("down"), ultra=_fcst(_hours(start, 6), "T1H"),
                vilage=_fcst(_hours(start, 6), "TMP"))
        with pytest.raises(KmaApiError):
            wc.build_heat_risk_response(*DOAN, now=NOW)

    def test_ultra_forecast_failure_continues_with_warning(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=_ncst(20.0), ultra=urllib.error.URLError("down"),
                vilage=_fcst(_hours(start, 30, temp=20.0), "TMP"))
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["current"]["air_temp_celsius"] == 20.0 and len(response["hourly_forecast"]) == 24
        assert len(response["warnings"]) == 1 and "초단기예보" in response["warnings"][0]
        assert response["bases"]["ultra_srt_fcst"] is None

    def test_short_term_failure_keeps_six_hour_forecast(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=_ncst(20.0), ultra=_fcst(_hours(start, 6, temp=20.0), "T1H"),
                vilage=urllib.error.URLError("down"))
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert len(response["hourly_forecast"]) == 6
        assert "단기예보" in response["warnings"][0]

    def test_both_forecasts_failing_still_returns_current_with_fallback_window(self, monkeypatch):
        _server(monkeypatch, ncst=_ncst(20.0), ultra=urllib.error.URLError("x"), vilage=urllib.error.URLError("y"))
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["hourly_forecast"] == [] and len(response["warnings"]) == 2
        assert response["golden_time_window"] == wc.NO_GOLDEN_WINDOW_TEXT
        assert response["golden_time_window_day"] is None
        assert response["current"]["air_temp_celsius"] == 20.0

    def test_no_temperature_anywhere_raises(self, monkeypatch):
        _server(monkeypatch, ncst=_ncst(None), ultra=[], vilage=[])
        with pytest.raises(KmaApiError, match="현재 기온"):
            wc.build_heat_risk_response(*DOAN, now=NOW)

    def test_current_temperature_falls_back_to_first_forecast(self, monkeypatch):
        start = NOW.replace(minute=0)
        _server(monkeypatch, ncst=_ncst(None), ultra=_fcst(_hours(start, 6, temp=22.0), "T1H"), vilage=[])
        assert wc.build_heat_risk_response(*DOAN, now=NOW)["current"]["air_temp_celsius"] == 22.0


class TestWeatherContext:
    def test_has_the_keys_the_agent_reads(self, monkeypatch):
        _default_server(monkeypatch, t1h=30.0)
        context = wc.build_weather_context(*DOAN, now=NOW)
        assert {"current", "golden_time_window", "golden_time_window_day", "is_live_estimated", "data_source"} <= set(context)
        assert context["current"]["estimated_surface_temp"] == 45.0
        assert context["current"]["air_temp_celsius"] == 30.0
        assert context["is_live_estimated"] is True and context["data_source"] == "kma_live"

    def test_is_derived_from_the_full_response(self, monkeypatch):
        _default_server(monkeypatch)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        context = wc.weather_context_from_response(response)
        assert context["current"] == response["current"]
        assert context["golden_time_window"] == response["golden_time_window"]
        assert "hourly_forecast" not in context  # 에이전트에는 현재값과 골든타임만 넘긴다

    def test_failure_propagates_so_the_caller_can_decide(self, monkeypatch):
        _server(monkeypatch, ncst=urllib.error.URLError("down"))
        with pytest.raises(KmaApiError):
            wc.build_weather_context(*DOAN, now=NOW)
