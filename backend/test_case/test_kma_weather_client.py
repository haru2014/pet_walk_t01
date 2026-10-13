"""[US-F1] 기상청 단기예보 호출 클라이언트 TDD 테스트 (네트워크 없이 가짜 응답으로 검증).

검증 항목:
1. 발표 시각 계산: 초단기실황(정시+10분), 초단기예보(HH:30 발표, HH:45 이후) 경계값.
2. 응답 해석: 숫자 변환, 결측(절댓값 900 이상) -> None, 범주 문자열 유지, 시각별 묶음.
3. 요청 형식: 주소, 인증키 URL 인코딩, 발표일시, 격자.
4. 오류 처리와 보안: 키 미설정, 기상청 오류코드, 비정상 응답, HTTP/연결 오류에서 키가 노출되지 않음.
5. 캐시: 같은 요청은 10분 동안 한 번만 호출.
"""

import json
import urllib.error
import urllib.parse
from datetime import datetime, timezone

import pytest

from services import kma_weather_client as kma
from services.kma_weather_client import KST, KmaApiError

SECRET = "SECRET/key+with=chars"


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    kma.clear_cache()
    monkeypatch.setenv(kma.ENV_SERVICE_KEY, SECRET)
    monkeypatch.delenv(kma.ENV_BASE_URL, raising=False)
    yield
    kma.clear_cache()


def _ok(items):
    return json.dumps({"response": {
        "header": {"resultCode": "00", "resultMsg": "NORMAL_SERVICE"},
        "body": {"dataType": "JSON", "items": {"item": items}, "pageNo": 1, "numOfRows": 100,
                 "totalCount": len(items)},
    }})


def _install(monkeypatch, texts):
    """_http_get 을 가짜로 바꾸고 호출된 URL 목록을 돌려준다."""
    calls = []
    queue = list(texts) if isinstance(texts, list) else None

    def fake(url, timeout):
        calls.append(url)
        return queue.pop(0) if queue is not None else texts

    monkeypatch.setattr(kma, "_http_get", fake)
    return calls


def _query(url):
    return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(url).query).items()}


# 2026-10-13 서울(비 오는 날) 실제 응답 형태
NCST_ITEMS = [
    {"category": "PTY", "obsrValue": "1"}, {"category": "REH", "obsrValue": "87"},
    {"category": "RN1", "obsrValue": "0.3"}, {"category": "T1H", "obsrValue": "16.7"},
    {"category": "UUU", "obsrValue": "-1.1"}, {"category": "VEC", "obsrValue": "37"},
    {"category": "VVV", "obsrValue": "-1.5"}, {"category": "WSD", "obsrValue": "2"},
]
NOW = datetime(2026, 10, 13, 12, 20, tzinfo=KST)


class TestBaseTime:
    @pytest.mark.parametrize("h, m, expected", [
        (12, 9, ("20261013", "1100")),   # 12:00 자료는 12:10 이후부터
        (12, 10, ("20261013", "1200")),
        (12, 59, ("20261013", "1200")),
        (0, 5, ("20261012", "2300")),    # 자정 직후는 전날 23시
    ])
    def test_ncst_base(self, h, m, expected):
        assert kma.latest_ultra_srt_ncst_base(datetime(2026, 10, 13, h, m, tzinfo=KST)) == expected

    @pytest.mark.parametrize("h, m, expected", [
        (12, 44, ("20261013", "1130")),  # 12:30 발표분은 12:45 이후부터
        (12, 45, ("20261013", "1230")),
        (12, 59, ("20261013", "1230")),
        (13, 0, ("20261013", "1230")),
        (0, 20, ("20261012", "2330")),   # 자정 직후는 전날 23:30
        (23, 50, ("20261013", "2330")),
    ])
    def test_fcst_base(self, h, m, expected):
        assert kma.latest_ultra_srt_fcst_base(datetime(2026, 10, 13, h, m, tzinfo=KST)) == expected

    def test_naive_datetime_is_treated_as_kst(self):
        assert kma.latest_ultra_srt_ncst_base(datetime(2026, 10, 13, 12, 20)) == ("20261013", "1200")

    def test_utc_datetime_is_converted_to_kst(self):
        utc_now = datetime(2026, 10, 13, 3, 20, tzinfo=timezone.utc)  # KST 12:20
        assert kma.latest_ultra_srt_ncst_base(utc_now) == ("20261013", "1200")


class TestFetchNcst:
    def test_parses_current_observation(self, monkeypatch):
        _install(monkeypatch, _ok(NCST_ITEMS))
        result = kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        v = result["values"]
        assert v["T1H"] == 16.7 and isinstance(v["T1H"], float)
        assert v["REH"] == 87 and isinstance(v["REH"], int)
        assert v["PTY"] == 1 and v["RN1"] == 0.3 and v["UUU"] == -1.1
        assert (result["base_date"], result["base_time"]) == ("20261013", "1200")
        assert (result["nx"], result["ny"]) == (60, 127)

    def test_missing_value_sentinel_becomes_none(self, monkeypatch):
        _install(monkeypatch, _ok([{"category": "T1H", "obsrValue": "-999"},
                                   {"category": "REH", "obsrValue": "900"}]))
        values = kma.fetch_ultra_srt_ncst(60, 127, now=NOW)["values"]
        assert values == {"T1H": None, "REH": None}

    def test_single_item_dict_is_accepted(self, monkeypatch):
        _install(monkeypatch, json.dumps({"response": {
            "header": {"resultCode": "00", "resultMsg": "OK"},
            "body": {"items": {"item": {"category": "T1H", "obsrValue": "20.5"}}}}}))
        assert kma.fetch_ultra_srt_ncst(60, 127, now=NOW)["values"] == {"T1H": 20.5}

    def test_request_url_and_key_encoding(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        kma.fetch_ultra_srt_ncst(67, 100, now=NOW)
        assert len(calls) == 1
        url = calls[0]
        assert urllib.parse.urlparse(url).path.endswith("/VilageFcstInfoService_2.0/getUltraSrtNcst")
        q = _query(url)
        assert q["serviceKey"] == SECRET  # 특수문자가 인코딩되어 전달되어도 원래 값으로 복원
        assert SECRET not in url          # 원문 그대로 URL 에 들어가면 안 된다
        assert q["dataType"] == "JSON"
        assert (q["base_date"], q["base_time"]) == ("20261013", "1200")
        assert (q["nx"], q["ny"]) == ("67", "100")

    def test_base_url_can_be_overridden(self, monkeypatch):
        monkeypatch.setenv(kma.ENV_BASE_URL, "https://example.test/svc/")
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert calls[0].startswith("https://example.test/svc/getUltraSrtNcst?")

    def test_explicit_service_key_overrides_env(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW, service_key="OTHER")
        assert _query(calls[0])["serviceKey"] == "OTHER"


class TestFetchFcst:
    ITEMS = [
        {"category": "T1H", "fcstDate": "20261013", "fcstTime": "1300", "fcstValue": "17"},
        {"category": "SKY", "fcstDate": "20261013", "fcstTime": "1300", "fcstValue": "4"},
        {"category": "RN1", "fcstDate": "20261013", "fcstTime": "1300", "fcstValue": "강수없음"},
        {"category": "T1H", "fcstDate": "20261013", "fcstTime": "1200", "fcstValue": "16"},
        {"category": "SKY", "fcstDate": "20261013", "fcstTime": "1200", "fcstValue": "3"},
    ]

    def test_groups_by_time_and_sorts(self, monkeypatch):
        _install(monkeypatch, _ok(self.ITEMS))
        result = kma.fetch_ultra_srt_fcst(60, 127, now=NOW)
        assert (result["base_date"], result["base_time"]) == ("20261013", "1130")
        slots = result["forecasts"]
        assert [s["fcst_time"] for s in slots] == ["1200", "1300"]
        assert slots[0]["values"] == {"T1H": 16.0, "SKY": 3}
        assert slots[1]["values"]["SKY"] == 4 and isinstance(slots[1]["values"]["SKY"], int)

    def test_category_strings_are_kept(self, monkeypatch):
        _install(monkeypatch, _ok(self.ITEMS))
        slots = kma.fetch_ultra_srt_fcst(60, 127, now=NOW)["forecasts"]
        assert slots[1]["values"]["RN1"] == "강수없음"

    def test_requests_enough_rows_for_six_hours(self, monkeypatch):
        calls = _install(monkeypatch, _ok(self.ITEMS))
        kma.fetch_ultra_srt_fcst(60, 127, now=NOW)
        assert int(_query(calls[0])["numOfRows"]) >= 60  # 6시간 x 약 10개 항목


class TestErrorsAndSecrecy:
    def test_missing_key_raises_without_calling(self, monkeypatch):
        monkeypatch.delenv(kma.ENV_SERVICE_KEY)
        calls = _install(monkeypatch, _ok([]))
        with pytest.raises(KmaApiError, match="KMA_SERVICE_KEY"):
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert calls == []

    def test_kma_error_code_is_exposed(self, monkeypatch):
        _install(monkeypatch, json.dumps({"response": {"header": {"resultCode": "03", "resultMsg": "NODATA_ERROR"}}}))
        with pytest.raises(KmaApiError) as exc:
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert exc.value.code == "03" and "NODATA_ERROR" in str(exc.value)

    def test_non_json_body_does_not_leak_key(self, monkeypatch):
        body = f"<OpenAPI_ServiceResponse>SERVICE KEY IS NOT REGISTERED {SECRET}</OpenAPI_ServiceResponse>"
        _install(monkeypatch, body)
        with pytest.raises(KmaApiError) as exc:
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert SECRET not in str(exc.value)
        assert "해석할 수 없는 응답" in str(exc.value)

    def test_http_error_does_not_leak_key(self, monkeypatch):
        def boom(url, timeout):
            raise urllib.error.HTTPError(url, 403, "Forbidden", None, None)
        monkeypatch.setattr(kma, "_http_get", boom)
        with pytest.raises(KmaApiError) as exc:
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert "403" in str(exc.value) and SECRET not in str(exc.value)
        assert exc.value.__cause__ is None and exc.value.__suppress_context__ is True

    @pytest.mark.parametrize("error", [urllib.error.URLError("dns"), TimeoutError("slow"), ConnectionResetError()])
    def test_connection_errors_are_wrapped(self, monkeypatch, error):
        def boom(url, timeout):
            raise error
        monkeypatch.setattr(kma, "_http_get", boom)
        with pytest.raises(KmaApiError, match="연결 실패"):
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)

    def test_error_is_not_cached(self, monkeypatch):
        calls = _install(monkeypatch, [json.dumps({"response": {"header": {"resultCode": "99", "resultMsg": "X"}}}),
                                       _ok(NCST_ITEMS)])
        with pytest.raises(KmaApiError):
            kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert kma.fetch_ultra_srt_ncst(60, 127, now=NOW)["values"]["T1H"] == 16.7
        assert len(calls) == 2


class TestCache:
    def test_same_request_hits_network_once(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert len(calls) == 1

    def test_different_grid_or_base_time_is_separate(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        kma.fetch_ultra_srt_ncst(67, 100, now=NOW)
        kma.fetch_ultra_srt_ncst(60, 127, now=datetime(2026, 10, 13, 13, 20, tzinfo=KST))
        assert len(calls) == 3

    def test_cache_expires_after_ttl(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        clock = [1000.0]
        monkeypatch.setattr(kma.time, "monotonic", lambda: clock[0])
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        clock[0] += kma.CACHE_TTL_S - 1
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert len(calls) == 1
        clock[0] += 2
        kma.fetch_ultra_srt_ncst(60, 127, now=NOW)
        assert len(calls) == 2

    def test_key_is_not_part_of_cache_key(self):
        kma.clear_cache()
        assert all(SECRET not in str(k) for k in kma._CACHE)


class TestTlsVerification:
    def test_certificate_verification_is_never_disabled(self):
        """certifi 를 쓰더라도 인증서 검증과 호스트 이름 검사가 켜져 있어야 한다."""
        import ssl
        ctx = kma._ssl_context()
        assert ctx.verify_mode == ssl.CERT_REQUIRED
        assert ctx.check_hostname is True


class TestLatLonHelper:
    def test_converts_pilot_site_to_grid(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        result = kma.fetch_current_weather_at(lat=36.3458, lon=127.3428, now=NOW)  # 도안호수공원
        q = _query(calls[0])
        assert (q["nx"], q["ny"]) == ("67", "100")
        assert (result["nx"], result["ny"]) == (67, 100)

    def test_out_of_domain_location_raises_before_calling(self, monkeypatch):
        calls = _install(monkeypatch, _ok(NCST_ITEMS))
        with pytest.raises(ValueError):
            kma.fetch_current_weather_at(lat=35.68, lon=139.69, now=NOW)  # 도쿄
        assert calls == []
