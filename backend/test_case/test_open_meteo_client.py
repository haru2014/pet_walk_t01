"""[US-F1] Open-Meteo 일사량 클라이언트 TDD 테스트 (네트워크 없이 가짜 응답으로 검증).

1. 응답 해석: 시각(KST), null 값 제외, 오류 응답.
2. 요청 형식: 주소, 위치·시간대 파라미터, 키가 필요 없음.
3. 캐시: 같은 위치·날짜는 30분 동안 한 번만 호출, 실패는 캐시하지 않음.
4. 일사 가중치: W/m² -> 0~1, '직전 1시간 평균' 표시 시각 규칙.
"""

import json
import urllib.error
import urllib.parse
from datetime import datetime, timedelta, timezone

import pytest

from services import open_meteo_client as om
from services.http_util import ssl_context
from services.kma_weather_client import KST

NOW = datetime(2026, 10, 14, 12, 20, tzinfo=KST)
DAEJEON = (36.3628, 127.3592)


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    om.clear_cache()
    monkeypatch.delenv(om.ENV_BASE_URL, raising=False)
    yield
    om.clear_cache()


def _payload(times, values, offset=32400, **extra):
    return json.dumps({"latitude": 36.36, "longitude": 127.36, "utc_offset_seconds": offset,
                       "timezone": "Asia/Seoul",
                       "hourly_units": {"time": "iso8601", "shortwave_radiation": "W/m²"},
                       "hourly": {"time": times, "shortwave_radiation": values}, **extra})


SAMPLE = _payload(["2026-10-14T11:00", "2026-10-14T12:00", "2026-10-14T13:00", "2026-10-14T19:00"],
                  [584.0, 663.0, 692.0, 0.0])


def _install(monkeypatch, texts):
    calls = []
    queue = list(texts) if isinstance(texts, list) else None

    def fake(url, timeout):
        calls.append(url)
        item = queue.pop(0) if queue is not None else texts
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(om, "_http_get", fake)
    return calls


def _query(url):
    return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}


class TestParsing:
    def test_times_become_kst_aware_and_values_floats(self, monkeypatch):
        _install(monkeypatch, SAMPLE)
        radiation = om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert radiation[datetime(2026, 10, 14, 13, 0, tzinfo=KST)] == 692.0
        assert radiation[datetime(2026, 10, 14, 19, 0, tzinfo=KST)] == 0.0
        assert len(radiation) == 4 and all(k.tzinfo is not None for k in radiation)

    def test_null_and_invalid_values_are_skipped(self, monkeypatch):
        text = _payload(["2026-10-14T11:00", "2026-10-14T12:00", "2026-10-14T13:00", "2026-10-14T14:00"],
                        [None, "x", 5.0, True])
        _install(monkeypatch, text)
        radiation = om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert radiation == {datetime(2026, 10, 14, 13, 0, tzinfo=KST): 5.0}

    def test_response_utc_offset_is_respected(self, monkeypatch):
        _install(monkeypatch, _payload(["2026-10-14T04:00"], [100.0], offset=0))  # UTC 04:00 = KST 13:00
        radiation = om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert radiation == {datetime(2026, 10, 14, 13, 0, tzinfo=KST): 100.0}

    def test_error_body_raises_with_reason(self, monkeypatch):
        _install(monkeypatch, json.dumps({"error": True, "reason": "Latitude must be in range of -90 to 90"}))
        with pytest.raises(om.OpenMeteoError, match="Latitude"):
            om.fetch_hourly_radiation(*DAEJEON, now=NOW)

    @pytest.mark.parametrize("body", ["not json", "{}", '{"hourly": {}}', '{"hourly": {"time": 5}}', "[]", "null"])
    def test_unexpected_bodies_raise_a_clear_error(self, monkeypatch, body):
        _install(monkeypatch, body)
        with pytest.raises(om.OpenMeteoError, match="해석할 수 없는"):
            om.fetch_hourly_radiation(*DAEJEON, now=NOW)


class TestRequest:
    def test_url_parameters(self, monkeypatch):
        calls = _install(monkeypatch, SAMPLE)
        om.fetch_hourly_radiation(36.3458, 127.3428, now=NOW, forecast_days=3)
        url = calls[0]
        assert url.startswith("https://api.open-meteo.com/v1/forecast?")
        q = _query(url)
        assert q["hourly"] == "shortwave_radiation" and q["timezone"] == "Asia/Seoul"
        assert (q["latitude"], q["longitude"], q["forecast_days"]) == ("36.3458", "127.3428", "3")
        assert "apikey" not in q  # 무료(비상업) 사용에는 키가 필요 없다

    def test_base_url_can_be_overridden(self, monkeypatch):
        monkeypatch.setenv(om.ENV_BASE_URL, "https://example.test/v1/forecast/")
        calls = _install(monkeypatch, SAMPLE)
        om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert calls[0].startswith("https://example.test/v1/forecast?")

    @pytest.mark.parametrize("lat, lon", [(None, 127.0), (36.0, "127"), (float("nan"), 127.0), (95.0, 127.0),
                                          (36.0, 200.0), (True, 127.0)])
    def test_invalid_coordinates_raise_before_any_call(self, monkeypatch, lat, lon):
        calls = _install(monkeypatch, SAMPLE)
        with pytest.raises(ValueError):
            om.fetch_hourly_radiation(lat, lon, now=NOW)
        assert calls == []


class TestErrors:
    @pytest.mark.parametrize("code", [400, 429, 500])
    def test_http_errors_include_the_status_code(self, monkeypatch, code):
        _install(monkeypatch, urllib.error.HTTPError("https://x", code, "err", None, None))
        with pytest.raises(om.OpenMeteoError, match=str(code)):
            om.fetch_hourly_radiation(*DAEJEON, now=NOW)

    @pytest.mark.parametrize("error", [urllib.error.URLError("dns"), TimeoutError("slow"), ConnectionResetError()])
    def test_connection_errors_are_wrapped(self, monkeypatch, error):
        _install(monkeypatch, error)
        with pytest.raises(om.OpenMeteoError, match="연결 실패"):
            om.fetch_hourly_radiation(*DAEJEON, now=NOW)

    def test_failed_calls_are_not_cached(self, monkeypatch):
        calls = _install(monkeypatch, [urllib.error.URLError("down"), SAMPLE])
        with pytest.raises(om.OpenMeteoError):
            om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert len(calls) == 2


class TestCache:
    def test_same_area_and_day_calls_once(self, monkeypatch):
        calls = _install(monkeypatch, SAMPLE)
        om.fetch_hourly_radiation(36.3628, 127.3592, now=NOW)
        om.fetch_hourly_radiation(36.3631, 127.3588, now=NOW)  # 소수점 2자리 기준으로 같은 위치
        assert len(calls) == 1

    def test_different_area_or_day_calls_again(self, monkeypatch):
        calls = _install(monkeypatch, SAMPLE)
        om.fetch_hourly_radiation(36.3628, 127.3592, now=NOW)
        om.fetch_hourly_radiation(36.5065, 127.2655, now=NOW)  # 세종
        om.fetch_hourly_radiation(36.3628, 127.3592, now=NOW + timedelta(days=1))
        assert len(calls) == 3

    def test_cache_expires_after_ttl(self, monkeypatch):
        calls = _install(monkeypatch, SAMPLE)
        clock = [1000.0]
        monkeypatch.setattr(om.time, "monotonic", lambda: clock[0])
        om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        clock[0] += om.CACHE_TTL_S - 1
        om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert len(calls) == 1
        clock[0] += 2
        om.fetch_hourly_radiation(*DAEJEON, now=NOW)
        assert len(calls) == 2


class TestWeight:
    @pytest.mark.parametrize("w_m2, expected", [(0.0, 0.0), (692.0, 0.692), (1000.0, 1.0), (1300.0, 1.0), (-5.0, 0.0)])
    def test_radiation_to_weight(self, w_m2, expected):
        assert om.radiation_to_weight(w_m2) == pytest.approx(expected)

    def test_slot_uses_the_value_stamped_one_hour_later(self):
        """직전 1시간 평균: 12:00~13:00 구간은 13:00 항목."""
        radiation = {datetime(2026, 10, 14, 12, 0, tzinfo=KST): 100.0,
                     datetime(2026, 10, 14, 13, 0, tzinfo=KST): 692.0,
                     datetime(2026, 10, 14, 14, 0, tzinfo=KST): 300.0}
        provider = om.make_insolation_provider(radiation)
        assert provider(datetime(2026, 10, 14, 12, 0, tzinfo=KST)) == pytest.approx(0.692)
        assert provider(datetime(2026, 10, 14, 12, 20, tzinfo=KST)) == pytest.approx(0.692)  # 같은 구간
        assert provider(datetime(2026, 10, 14, 13, 0, tzinfo=KST)) == pytest.approx(0.3)

    def test_missing_hour_returns_none_so_the_caller_can_fall_back(self):
        provider = om.make_insolation_provider({datetime(2026, 10, 14, 13, 0, tzinfo=KST): 500.0})
        assert provider(datetime(2026, 10, 14, 18, 0, tzinfo=KST)) is None

    def test_other_timezone_input_is_matched_by_instant(self):
        provider = om.make_insolation_provider({datetime(2026, 10, 14, 13, 0, tzinfo=KST): 500.0})
        utc_slot = datetime(2026, 10, 14, 3, 0, tzinfo=timezone.utc)  # KST 12:00
        assert provider(utc_slot) == pytest.approx(0.5)

    def test_zero_radiation_at_night_is_a_real_value_not_missing(self):
        provider = om.make_insolation_provider({datetime(2026, 10, 14, 20, 0, tzinfo=KST): 0.0})
        assert provider(datetime(2026, 10, 14, 19, 0, tzinfo=KST)) == 0.0


class TestAttributionAndTls:
    def test_attribution_text(self):
        assert om.ATTRIBUTION == "Weather data by Open-Meteo.com (CC BY 4.0)"

    def test_certificate_verification_stays_on(self):
        import ssl
        ctx = ssl_context()
        assert ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname is True
