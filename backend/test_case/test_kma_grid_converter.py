"""[US-F1] 위경도 <-> 기상청 단기예보 격자(X, Y) 변환기 TDD 테스트.

검증 방식:
1. 대표 도시: 기상청 격자표의 대표값으로 알려진 5곳(서울·인천·부산·광주·세종)과 계산값 비교.
2. 공식 격자표 정답: 기상청 '격자_위경도' 엑셀(최종 업데이트 2026-07-01)의 행정구역별 값을
   상수로 옮겨 비교한다. 엑셀 전체(3,838행)를 대조했을 때 이어도(좌표 없음 2행)를 뺀
   3,836행 중 약 98.9% 가 일치했고, 나머지 약 1% 는 모두 1칸 차이이며 칸 경계 부근이다.
   (관평동·다정동처럼 표의 대표좌표와 격자 지정이 어긋난 행이 있어 정답으로 쓰지 않는다.)
3. 파일럿 거점(대전 3곳·세종호수공원): 인접 동의 공식 격자와 일치함을 확인한 값을 고정.
4. 왕복 변환: 격자 -> 위경도 -> 격자가 항상 원래 격자로 돌아오는지 (격자 전 영역 표본).
5. 입력 검증: 범위 밖 좌표, 숫자가 아닌 값은 ValueError.
"""

import math

import pytest

from services.kma_grid_converter import (
    EARTH_RADIUS_KM,
    GRID_X_MAX,
    GRID_Y_MAX,
    grid_to_latlon,
    latlon_to_grid,
)


class TestKnownCities:
    """기상청 격자표의 대표값과 계산값이 일치하는지 검증."""

    @pytest.mark.parametrize(
        "name, lat, lon, expected",
        [
            ("서울시청", 37.5665, 126.9780, (60, 127)),
            ("인천시청", 37.4563, 126.7052, (55, 124)),
            ("부산시청", 35.1796, 129.0756, (98, 76)),
            ("광주시청", 35.1595, 126.8526, (58, 74)),
            ("세종시청", 36.4800, 127.2890, (66, 103)),
        ],
    )
    def test_city_hall_grid(self, name, lat, lon, expected):
        assert latlon_to_grid(lat=lat, lon=lon) == expected, name


class TestOfficialGridTable:
    """기상청 공식 격자표(2026-07-01)의 행정구역별 (위도, 경도) -> 격자 정답과 비교."""

    @pytest.mark.parametrize(
        "name, lat, lon, expected",
        [
            ("서울 종로구 청운효자동", 37.5841367, 126.9706519, (60, 127)),
            ("대전 유성구 진잠동", 36.2968, 127.3186, (66, 99)),
            ("대전 유성구 상대동", 36.3468, 127.3347, (66, 100)),
            ("대전 유성구 온천2동", 36.3572, 127.3390, (66, 101)),
            ("대전 유성구 신성동", 36.3862, 127.3495, (67, 101)),
            ("대전 유성구 원신흥동", 36.3421, 127.3433, (67, 100)),
            ("대전 유성구 구즉동", 36.4375, 127.3859, (67, 102)),
            ("대전 유성구 전민동", 36.3970, 127.4025, (68, 101)),
            ("세종 한솔동", 36.4790, 127.2546, (65, 103)),
            ("세종 어진동", 36.5017, 127.2567, (65, 104)),
            ("세종 도담동", 36.5173, 127.2624, (65, 104)),
            ("세종 소담동", 36.4835, 127.3012, (66, 103)),
        ],
    )
    def test_matches_official_table(self, name, lat, lon, expected):
        assert latlon_to_grid(lat=lat, lon=lon) == expected, name


class TestPilotSitesRegression:
    """대전·세종 파일럿 거점 주차장 출입구의 격자.

    인접한 공식 동과 같은 격자임을 확인한 값이다:
    도안호수공원 ~ 원신흥동 (67,100), 송강근린공원 ~ 구즉동 (67,102),
    유림공원 ~ 신성동 (67,101), 세종호수공원 ~ 어진동 (65,104).
    """

    @pytest.mark.parametrize(
        "name, lat, lon, expected",
        [
            ("대전 유림공원 부설주차장", 36.3628, 127.3592, (67, 101)),
            ("대전 송강근린공원 주차장", 36.4320, 127.3810, (67, 102)),
            ("대전 도안호수공원 임시주차장", 36.3458, 127.3428, (67, 100)),
            ("세종호수공원 제1주차장", 36.5065, 127.2655, (65, 104)),
        ],
    )
    def test_pilot_site_grid(self, name, lat, lon, expected):
        assert latlon_to_grid(lat=lat, lon=lon) == expected, name

    def test_same_park_parking_lots_share_one_cell(self):
        """같은 공원의 주차장들은 같은 격자에 속해야 날씨 호출을 한 번만 해도 된다."""
        yurim = [(36.3628, 127.3592), (36.3615, 127.3598), (36.3640, 127.3575)]
        cells = {latlon_to_grid(lat=la, lon=lo) for la, lo in yurim}
        assert len(cells) == 1


class TestRoundTrip:
    """격자 -> 위경도 -> 격자 왕복 변환 검증."""

    def test_grid_center_roundtrip_over_whole_domain(self):
        for nx in range(1, GRID_X_MAX + 1, 4):
            for ny in range(1, GRID_Y_MAX + 1, 4):
                lat, lon = grid_to_latlon(nx, ny)
                assert latlon_to_grid(lat=lat, lon=lon) == (nx, ny), (nx, ny)

    def test_seoul_cell_center_is_near_seoul(self):
        lat, lon = grid_to_latlon(60, 127)
        assert lat == pytest.approx(37.58, abs=0.02)
        assert lon == pytest.approx(126.99, abs=0.02)

    def test_cell_size_matches_lcc_scale_factor(self):
        """인접 격자 중심 사이의 실제 거리가 LCC 축척에 맞는 값(서울 부근 약 5.13km)인지 검증.

        기상청 투영은 표준위도(30도, 60도) 사이에서 지도상 5km 가 실제로는 5/k km 이다.
        (서울 부근 축척계수 k = 0.975 -> 5.128km). 또한 등각 투영이라 동서·남북 간격이 같다.
        """
        def haversine_km(a, b):
            p1, p2 = math.radians(a[0]), math.radians(b[0])
            dp, dl = p2 - p1, math.radians(b[1] - a[1])
            h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
            return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))

        center = grid_to_latlon(60, 127)
        east_km = haversine_km(center, grid_to_latlon(61, 127))
        north_km = haversine_km(center, grid_to_latlon(60, 128))
        assert east_km == pytest.approx(5.128, abs=0.02)
        assert north_km == pytest.approx(east_km, abs=0.02)


class TestDirection:
    """방향 관계: 북쪽으로 갈수록 ny 증가, 동쪽으로 갈수록 nx 증가."""

    def test_north_increases_ny(self):
        _, south_y = latlon_to_grid(lat=36.0, lon=127.0)
        _, north_y = latlon_to_grid(lat=37.0, lon=127.0)
        assert north_y > south_y

    def test_east_increases_nx(self):
        west_x, _ = latlon_to_grid(lat=36.5, lon=126.5)
        east_x, _ = latlon_to_grid(lat=36.5, lon=127.5)
        assert east_x > west_x


class TestInputValidation:
    """범위 밖 좌표와 잘못된 입력 처리."""

    @pytest.mark.parametrize(
        "lat, lon",
        [(35.68, 139.69), (39.9, 116.4)],
        ids=["도쿄", "베이징"],
    )
    def test_outside_kma_domain_raises(self, lat, lon):
        with pytest.raises(ValueError):
            latlon_to_grid(lat=lat, lon=lon)

    @pytest.mark.parametrize(
        "lat, lon",
        [(None, 127.0), (36.0, None), ("36", 127.0), (float("nan"), 127.0), (36.0, float("inf")), (True, 127.0)],
        ids=["lat None", "lon None", "lat 문자열", "lat NaN", "lon inf", "lat bool"],
    )
    def test_non_numeric_input_raises(self, lat, lon):
        with pytest.raises(ValueError):
            latlon_to_grid(lat=lat, lon=lon)

    @pytest.mark.parametrize("nx, ny", [(0, 100), (150, 100), (60, 0), (60, 254)])
    def test_grid_out_of_range_raises(self, nx, ny):
        with pytest.raises(ValueError):
            grid_to_latlon(nx, ny)
