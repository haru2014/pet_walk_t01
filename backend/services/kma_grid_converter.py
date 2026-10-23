"""[US-F1] 위경도 <-> 기상청 단기예보 격자(X, Y) 변환기.

기상청 단기예보 API(getUltraSrtNcst / getUltraSrtFcst / getVilageFcst)는 위경도가 아니라
람베르트 정각원추(LCC) 투영으로 만든 5km 격자 번호(nx, ny)를 입력으로 받는다.
이 모듈은 기상청이 공개한 표준 변환식(기준점 38.0N, 126.0E, 격자 간격 5km)을 구현한다.

좌표 순서 주의: 이 모듈의 함수는 기상청 관례에 따라 (위도, 경도) 순서이다.
프로젝트의 GeoJSON 좌표([경도, 위도])와 순서가 반대이므로 인자 이름으로 넘기는 것을 권장한다.
"""

import math
from typing import Tuple

# 기상청 LCC 투영 표준 상수
EARTH_RADIUS_KM = 6371.00877   # 지구 반경 (km)
GRID_SPACING_KM = 5.0          # 격자 간격 (km)
STD_LAT1_DEG = 30.0            # 표준 위도 1 (도)
STD_LAT2_DEG = 60.0            # 표준 위도 2 (도)
ORIGIN_LON_DEG = 126.0         # 기준점 경도 (도)
ORIGIN_LAT_DEG = 38.0          # 기준점 위도 (도)
ORIGIN_X = 43.0                # 기준점의 격자 X
ORIGIN_Y = 136.0               # 기준점의 격자 Y

# 기상청 동네예보 격자 범위 (X: 1~149, Y: 1~253)
GRID_X_MAX = 149
GRID_Y_MAX = 253

_DEGRAD = math.pi / 180.0


def _lcc_constants() -> Tuple[float, float, float, float]:
    """LCC 투영에 필요한 상수 (re, sn, sf, ro)를 계산한다."""
    re = EARTH_RADIUS_KM / GRID_SPACING_KM
    slat1 = STD_LAT1_DEG * _DEGRAD
    slat2 = STD_LAT2_DEG * _DEGRAD
    olat = ORIGIN_LAT_DEG * _DEGRAD

    sn = math.tan(math.pi * 0.25 + slat2 * 0.5) / math.tan(math.pi * 0.25 + slat1 * 0.5)
    sn = math.log(math.cos(slat1) / math.cos(slat2)) / math.log(sn)
    sf = math.tan(math.pi * 0.25 + slat1 * 0.5)
    sf = math.pow(sf, sn) * math.cos(slat1) / sn
    ro = math.tan(math.pi * 0.25 + olat * 0.5)
    ro = re * sf / math.pow(ro, sn)
    return re, sn, sf, ro


_RE, _SN, _SF, _RO = _lcc_constants()


def _require_finite(name: str, value: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} 는 유한한 숫자여야 합니다: {value!r}")
    return float(value)


def latlon_to_grid(lat: float, lon: float) -> Tuple[int, int]:
    """위도/경도(도)를 기상청 격자 (nx, ny)로 변환한다.

    Raises:
        ValueError: 숫자가 아니거나, 기상청 격자 범위(X 1~149, Y 1~253) 밖인 경우.
    """
    lat = _require_finite("lat", lat)
    lon = _require_finite("lon", lon)
    if not -90.0 < lat < 90.0:
        raise ValueError(f"lat 는 -90~90 범위여야 합니다: {lat}")

    ra = math.tan(math.pi * 0.25 + lat * _DEGRAD * 0.5)
    ra = _RE * _SF / math.pow(ra, _SN)
    theta = lon * _DEGRAD - ORIGIN_LON_DEG * _DEGRAD
    if theta > math.pi:
        theta -= 2.0 * math.pi
    if theta < -math.pi:
        theta += 2.0 * math.pi
    theta *= _SN

    nx = math.floor(ra * math.sin(theta) + ORIGIN_X + 0.5)
    ny = math.floor(_RO - ra * math.cos(theta) + ORIGIN_Y + 0.5)
    if not (1 <= nx <= GRID_X_MAX and 1 <= ny <= GRID_Y_MAX):
        raise ValueError(
            f"기상청 격자 범위를 벗어난 좌표입니다: lat={lat}, lon={lon} -> nx={nx}, ny={ny}"
        )
    return nx, ny


def grid_to_latlon(nx: int, ny: int) -> Tuple[float, float]:
    """기상청 격자 (nx, ny)의 중심 위도/경도(도)를 반환한다.

    Raises:
        ValueError: 기상청 격자 범위(X 1~149, Y 1~253) 밖인 경우.
    """
    if not (1 <= nx <= GRID_X_MAX and 1 <= ny <= GRID_Y_MAX):
        raise ValueError(f"기상청 격자 범위를 벗어났습니다: nx={nx}, ny={ny}")

    xn = nx - ORIGIN_X
    yn = _RO - ny + ORIGIN_Y
    ra = math.sqrt(xn * xn + yn * yn)
    if _SN < 0.0:
        ra = -ra
    alat = math.pow(_RE * _SF / ra, 1.0 / _SN)
    alat = 2.0 * math.atan(alat) - math.pi * 0.5

    if abs(xn) <= 0.0:
        theta = 0.0
    elif abs(yn) <= 0.0:
        theta = math.pi * 0.5
        if xn < 0.0:
            theta = -theta
    else:
        theta = math.atan2(xn, yn)
    alon = theta / _SN + ORIGIN_LON_DEG * _DEGRAD
    return alat / _DEGRAD, alon / _DEGRAD
