"""[편안하개 - PetWalk]
에어코리아(AirKorea) 대기질 클라이언트 단위 테스트
"""

from services import airkorea_client


def test_resolve_sido_name():
    # 대전
    assert airkorea_client.resolve_sido_name(36.35, 127.38) == "대전"
    # 세종
    assert airkorea_client.resolve_sido_name(36.50, 127.25) == "세종"
    # 서울
    assert airkorea_client.resolve_sido_name(37.56, 126.97) == "서울"


def test_pm10_to_grade_label():
    assert airkorea_client.pm10_to_grade_label(15.0) == "좋음"
    assert airkorea_client.pm10_to_grade_label(45.0) == "보통"
    assert airkorea_client.pm10_to_grade_label(100.0) == "나쁨"
    assert airkorea_client.pm10_to_grade_label(180.0) == "매우나쁨"
    assert airkorea_client.pm10_to_grade_label(None) == "보통"


def test_fetch_air_quality_fallback_without_key():
    airkorea_client.clear_cache()
    # 키가 없을 때도 Open-Meteo 또는 기본값으로 무중단 안전 응답
    res = airkorea_client.fetch_air_quality(36.35, 127.38, service_key=None, timeout=2.0)
    assert isinstance(res, dict)
    assert "pm10" in res
    assert "grade_label" in res
    assert res["grade_label"] in ("좋음", "보통", "나쁨", "매우나쁨")


def test_clean_key_decoding():
    import urllib.parse
    # Encoding 키(%2B 등)와 Decoding 키(+) 모두 unquote -> urlencode 시 안전하게 단일 인코딩됨을 검증
    encoded_sample = "testKey%2B123%2Fxyz%3D%3D"
    decoded_sample = "testKey+123/xyz=="
    assert urllib.parse.unquote(encoded_sample) == decoded_sample
    assert urllib.parse.urlencode({"serviceKey": urllib.parse.unquote(encoded_sample)}) == "serviceKey=testKey%2B123%2Fxyz%3D%3D"
    assert urllib.parse.urlencode({"serviceKey": urllib.parse.unquote(decoded_sample)}) == "serviceKey=testKey%2B123%2Fxyz%3D%3D"
