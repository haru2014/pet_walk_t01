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


_REAL_RESOLVE = wc._resolve_insolation


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    """기상청 캐시를 비우고, 일사량은 네트워크 없이 하늘상태/직접 준 제공자로만 계산한다."""
    kma.clear_cache()
    monkeypatch.setenv(kma.ENV_SERVICE_KEY, "TESTKEY")
    monkeypatch.delenv(kma.ENV_BASE_URL, raising=False)
    monkeypatch.setattr(
        wc, "_resolve_insolation",
        lambda lat, lon, when, provider, use_open_meteo, timeout, warnings:
            (provider, "custom" if provider else "sky_only", None))
    yield
    kma.clear_cache()


@pytest.fixture
def real_insolation(monkeypatch):
    """Open-Meteo 연결 경로를 시험할 때 실제 _resolve_insolation 으로 되돌린다."""
    monkeypatch.setattr(wc, "_resolve_insolation", _REAL_RESOLVE)


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
        (30.0, 1.0, 45.0), (28.5, 0.6, 38.1), (16.7, 0.0, 18.3), (20.04, 0.2, 24.3),
    ])
    def test_estimate_surface_temp(self, air, weight, expected):
        assert wc.estimate_surface_temp(air, weight) == expected

    @pytest.mark.parametrize("temp, expected", [
        (20.0, "SAFE"), (33.0, "SAFE"), (33.1, "CAUTION"), (45.0, "CAUTION"), (45.1, "DANGER"),
    ])
    def test_risk_level_boundaries(self, temp, expected):
        assert wc.risk_level(temp) == expected

    def test_daylight_at_noon_and_midnight_in_daejeon(self):
        assert wc.is_daylight(datetime(2026, 10, 13, 12, 0, tzinfo=KST), *DOAN) is True
        assert wc.is_daylight(datetime(2026, 10, 13, 0, 0, tzinfo=KST), *DOAN) is False

    def test_daylight_fallback_when_sun_calculation_fails(self, monkeypatch):
        try:
            import suncalc
            monkeypatch.setattr(suncalc, "get_position", lambda *a, **k: (_ for _ in ()).throw(ValueError("x")))
        except ImportError:
            pass
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
        assert current["estimated_surface_temp"] == 18.3 and current["risk_level"] == "SAFE"
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
        assert current["condition"] == "night" and current["estimated_surface_temp"] == 26.6

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

    def test_current_hour_slot_is_filled_when_forecasts_start_at_the_next_hour(self, monkeypatch):
        """매시 45분 이후(예: 20:50)에는 기상청 예보가 21시부터라서 현재 시각 슬롯이 없다. 관측값으로 채운다."""
        late = datetime(2026, 10, 13, 20, 50, tzinfo=KST)
        next_hour = late.replace(minute=0) + timedelta(hours=1)
        _server(monkeypatch, ncst=_ncst(13.0),
                ultra=_fcst(_hours(next_hour, 6, temp=12.0, sky=1), "T1H"),
                vilage=_fcst(_hours(next_hour, 30, temp=12.0, sky=1), "TMP"))
        response = wc.build_heat_risk_response(*DOAN, now=late)
        hourly = response["hourly_forecast"]
        assert datetime.fromisoformat(hourly[0]["time"]) == late.replace(minute=0)
        assert hourly[0]["hour"] == 20 and hourly[0]["air_temp_celsius"] == 13.0  # 현재 관측값
        assert datetime.fromisoformat(hourly[1]["time"]) == next_hour
        assert [h["time"] for h in hourly] == sorted(h["time"] for h in hourly)
        assert (response["golden_time_window"], response["golden_time_window_day"]) == ("20:00 ~ 23:00", "today")

    def test_current_hour_slot_is_not_duplicated_when_the_forecast_has_it(self, monkeypatch):
        _default_server(monkeypatch)
        hours = [h["hour"] for h in wc.build_heat_risk_response(*DOAN, now=NOW)["hourly_forecast"]]
        assert hours.count(12) == 1 and len(hours) == 24

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
        assert cloudy["current"]["estimated_surface_temp"] == 31.6
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


class TestOpenMeteoIntegration:
    """일사량: Open-Meteo 우선, 실패하면 하늘상태, 직접 준 제공자가 있으면 그것이 우선."""

    @staticmethod
    def _radiation(**by_hour):
        """{표시 시각(직전 1시간 평균의 끝): W/m²}. 예: h13=500 -> 13:00 항목."""
        return {datetime(2026, 10, 13, int(k[1:]), 0, tzinfo=KST): v for k, v in by_hour.items()}

    @staticmethod
    def _fake_fetch(monkeypatch, result=None, error=None):
        calls = []

        def fake(lat, lon, now=None, *, timeout=5.0, forecast_days=2):
            calls.append((lat, lon))
            if error:
                raise error
            return result

        monkeypatch.setattr(wc.open_meteo_client, "fetch_hourly_radiation", fake)
        return calls

    def test_open_meteo_value_replaces_the_sky_assumption(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, self._radiation(h13=500.0))  # 12~13시 평균 500 W/m²
        _default_server(monkeypatch, t1h=30.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        current = response["current"]
        assert current["insolation_weight"] == 0.5 and current["insolation_source"] == "provider"
        assert (current["estimated_surface_temp"], current["risk_level"]) == (38.3, "CAUTION")  # 맑음 가정이면 45.0
        assert response["insolation_source"] == "open_meteo"
        assert response["attribution"] == "Weather data by Open-Meteo.com (CC BY 4.0)"

    def test_hours_without_radiation_fall_back_to_the_sky_per_hour(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, self._radiation(h13=500.0))
        _default_server(monkeypatch, t1h=30.0)
        hourly = wc.build_heat_risk_response(*DOAN, now=NOW)["hourly_forecast"]
        by_hour = {h["hour"]: h for h in hourly}
        assert by_hour[12]["insolation_source"] == "provider" and by_hour[12]["insolation_weight"] == 0.5
        assert by_hour[14]["insolation_source"] == "sky" and by_hour[14]["insolation_weight"] == 1.0

    def test_uses_the_preceding_hour_mean_stamped_one_hour_later(self, monkeypatch, real_insolation):
        """12시 구간(12:00~13:00)은 13:00 항목, 13시 구간은 14:00 항목의 값이다."""
        self._fake_fetch(monkeypatch, self._radiation(h12=100.0, h13=700.0, h14=300.0))
        _default_server(monkeypatch, t1h=20.0)
        by_hour = {h["hour"]: h for h in wc.build_heat_risk_response(*DOAN, now=NOW)["hourly_forecast"]}
        assert by_hour[12]["insolation_weight"] == 0.7  # 13:00 항목
        assert by_hour[13]["insolation_weight"] == 0.3  # 14:00 항목

    def test_radiation_above_1000_is_capped(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, self._radiation(h13=1200.0))
        _default_server(monkeypatch, t1h=20.0)
        assert wc.build_heat_risk_response(*DOAN, now=NOW)["current"]["insolation_weight"] == 1.0

    def test_failure_falls_back_to_sky_with_a_warning(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, error=wc.open_meteo_client.OpenMeteoError("Open-Meteo 연결 실패 (URLError)"))
        _default_server(monkeypatch, t1h=30.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["insolation_source"] == "sky_fallback" and response["attribution"] is None
        assert response["current"]["estimated_surface_temp"] == 45.0  # 맑음 기본값
        assert any("Open-Meteo" in w and "하늘상태" in w for w in response["warnings"])

    def test_empty_radiation_falls_back_to_sky_with_a_warning(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, result={})
        _default_server(monkeypatch, t1h=30.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW)
        assert response["insolation_source"] == "sky_fallback"
        assert any("비어" in w for w in response["warnings"])

    def test_open_meteo_can_be_turned_off(self, monkeypatch, real_insolation):
        calls = self._fake_fetch(monkeypatch, self._radiation(h13=500.0))
        _default_server(monkeypatch, t1h=30.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW, use_open_meteo=False)
        assert calls == [] and response["insolation_source"] == "sky_only"
        assert response["attribution"] is None and response["warnings"] == []

    def test_custom_provider_takes_precedence_and_skips_the_call(self, monkeypatch, real_insolation):
        calls = self._fake_fetch(monkeypatch, self._radiation(h13=500.0))
        _default_server(monkeypatch, t1h=30.0)
        response = wc.build_heat_risk_response(*DOAN, now=NOW, insolation_provider=lambda t: 0.0)
        assert calls == [] and response["insolation_source"] == "custom"
        assert response["current"]["estimated_surface_temp"] == 31.6

    def test_observation_failure_does_not_call_open_meteo(self, monkeypatch, real_insolation):
        calls = self._fake_fetch(monkeypatch, self._radiation(h13=500.0))
        _server(monkeypatch, ncst=urllib.error.URLError("down"))
        with pytest.raises(KmaApiError):
            wc.build_heat_risk_response(*DOAN, now=NOW)
        assert calls == []

    def test_context_carries_source_and_attribution(self, monkeypatch, real_insolation):
        self._fake_fetch(monkeypatch, self._radiation(h13=500.0))
        _default_server(monkeypatch, t1h=30.0)
        context = wc.build_weather_context(*DOAN, now=NOW)
        assert context["insolation_source"] == "open_meteo"
        assert context["attribution"] == "Weather data by Open-Meteo.com (CC BY 4.0)"


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
        assert "hourly_forecast" not in context  # 전체 목록 대신 앞으로 12시간 요약만 넘긴다
        upcoming = context["forecast_next_hours"]
        assert len(upcoming) == wc.PLANNING_FORECAST_HOURS
        assert upcoming[0]["time"] == response["hourly_forecast"][0]["time"]
        assert set(upcoming[0]) <= set(wc._FORECAST_KEYS) and "pop" in upcoming[0]

    def test_dry_weather_has_no_rain(self, monkeypatch):
        _default_server(monkeypatch)
        rain = wc.build_weather_context(*DOAN, now=NOW)["precipitation"]
        assert rain["known"] is True and rain["is_precipitating_now"] is False
        assert rain["rain_expected_times"] == [] and rain["threshold_pop"] == 60

    def test_rain_now_and_ahead_is_passed_to_the_planner(self, monkeypatch):
        """비가 오면 지면온도는 낮게 나오지만, 비 자체를 경로 생성이 알 수 있어야 한다."""
        _default_server(monkeypatch, pty=1)
        context = wc.build_weather_context(*DOAN, now=NOW)
        rain = context["precipitation"]
        assert rain["known"] is True and rain["is_precipitating_now"] is True
        assert rain["pop_now"] == 100 and rain["max_pop_next_3h"] == 100
        assert len(rain["rain_expected_times"]) == 6
        assert context["current"]["is_golden_time"] is True  # 지면온도만 보면 '안전'이라 비 정보가 따로 필요하다

    def test_fallback_estimate_marks_rain_as_unknown(self):
        hourly = [{"hour": h, "air_temp_celsius": 25.0, "estimated_surface_temp": 30.0, "risk_level": "SAFE",
                   "is_golden_time": True} for h in range(24)]
        response = {"current": hourly[15], "golden_time_window": "06:00 ~ 08:00", "golden_time_window_day": "today",
                    "data_source": "fallback_estimate", "insolation_source": None, "attribution": None, "grid": None,
                    "warnings": [], "hourly_forecast": hourly}
        context = wc.weather_context_from_response(response)
        assert context["precipitation"]["known"] is False and context["precipitation"]["is_precipitating_now"] is None
        assert [h["hour"] for h in context["forecast_next_hours"]] == list(range(15, 24))

    def test_failure_propagates_so_the_caller_can_decide(self, monkeypatch):
        _server(monkeypatch, ncst=urllib.error.URLError("down"))
        with pytest.raises(KmaApiError):
            wc.build_weather_context(*DOAN, now=NOW)


class TestDirtHeatGain:
    """흙 상승폭은 기상청 ASOS 관측 지면온도(맨땅)에 맞춘 값이다 (docs/reports/2026-10-18_지면온도_추정_오차_평가.md)."""

    def test_dirt_gain_matches_the_observed_bare_ground_fit(self):
        assert wc.SURFACE_HEAT_GAIN_MAP["dirt"] == 12.6
        assert wc.calculate_surface_temps(30.0, 1.0)["dirt"] == 42.6
        assert wc.SURFACE_HEAT_GAIN_MAP["grass"] < wc.SURFACE_HEAT_GAIN_MAP["dirt"] < wc.SURFACE_HEAT_GAIN_MAP["asphalt"]

    def test_server_fallback_uses_the_same_dirt_gain(self):
        import main
        for entry in main._generate_fallback_hourly_dtos():
            weight = entry["solar_radiation_w_m2"] / 1000.0
            expected = round(entry["air_temp_celsius"] + 1.6 * (1.0 - weight) + weight * wc.SURFACE_HEAT_GAIN_MAP["dirt"], 1)
            assert entry["surface_temps"]["dirt"] == expected, entry["hour"]
