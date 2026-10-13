"""[US-A3] 경로 지오메트리 실측 유틸리티.

산책 경로의 거리, 소요 시간, 순환 종결성, 왕복(되돌아가기) 비율을 좌표열에서 직접 계산한다.
모든 코스 지표는 이 모듈의 실측값만을 단일 진실 공급원(SSOT)으로 사용한다.
좌표는 GeoJSON 표준 순서인 [경도, 위도] 이다.
"""

import math
from typing import Dict, List, Sequence, Tuple

Coordinate = Sequence[float]

EARTH_RADIUS_M = 6_371_000.0
COORD_KEY_DIGITS = 6


def haversine_m(a: Coordinate, b: Coordinate) -> float:
    """두 [경도, 위도] 좌표 사이의 구면 거리(m)를 반환한다."""
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    d_lat = lat2 - lat1
    d_lon = math.radians(b[0] - a[0])
    h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def polyline_length_m(coords: Sequence[Coordinate]) -> float:
    """좌표열 전체 길이(m)를 누적 계산한다."""
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def cumulative_distances_m(coords: Sequence[Coordinate]) -> List[float]:
    """각 좌표까지의 출발점 기준 누적 거리(m) 목록을 반환한다."""
    acc = [0.0]
    for i in range(len(coords) - 1):
        acc.append(acc[-1] + haversine_m(coords[i], coords[i + 1]))
    return acc


def walking_speed_m_per_min(speed_kmh: float) -> float:
    """km/h 보행 속도를 m/min 로 환산한다."""
    return speed_kmh * 1000.0 / 60.0


def estimate_duration_minutes(distance_m: float, speed_kmh: float) -> float:
    """실측 거리와 반려견 보행 속도로 예상 소요 시간(분)을 계산한다."""
    return round(distance_m / walking_speed_m_per_min(speed_kmh), 1)


def loop_closure_gap_m(coords: Sequence[Coordinate]) -> float:
    """출발점과 도착점 사이의 거리(m). 완전한 순환 코스이면 0 에 가깝다."""
    if len(coords) < 2:
        return 0.0
    return haversine_m(coords[0], coords[-1])


def _coord_key(c: Coordinate) -> Tuple[float, float]:
    return (round(c[0], COORD_KEY_DIGITS), round(c[1], COORD_KEY_DIGITS))


def collapse_backtracks(coords: Sequence[Coordinate]) -> List[List[float]]:
    """A→B→A 형태로 같은 길을 갔다가 되돌아오는 막다른 왕복 구간을 제거한다.

    스택 방식으로 직전 이전 좌표로 되돌아가는 지점을 상쇄하므로
    A→B→C→B→A 처럼 중첩된 왕복도 한 번에 정리되고 경로 연속성은 유지된다.
    """
    stack: List[Tuple[float, float]] = []
    for c in coords:
        key = _coord_key(c)
        if stack and stack[-1] == key:
            continue
        if len(stack) >= 2 and stack[-2] == key:
            stack.pop()
            continue
        stack.append(key)
    return [[lon, lat] for lon, lat in stack]


def backtrack_ratio(coords: Sequence[Coordinate]) -> float:
    """이미 지나간 구간(방향 무관)을 다시 걷는 거리의 전체 거리 대비 비율(0.0~1.0)."""
    total = polyline_length_m(coords)
    if total <= 0:
        return 0.0
    seen: Dict[frozenset, bool] = {}
    repeated = 0.0
    for i in range(len(coords) - 1):
        a, b = _coord_key(coords[i]), _coord_key(coords[i + 1])
        key = frozenset((a, b))
        if key in seen:
            repeated += haversine_m(coords[i], coords[i + 1])
        seen[key] = True
    return repeated / total


def bearing_deg(a: Coordinate, b: Coordinate) -> float:
    """a 에서 b 로 향하는 진행 방위각(0~360, 북쪽 0도, 시계 방향)."""
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    d_lon = math.radians(b[0] - a[0])
    y = math.sin(d_lon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
    return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0


def destination_point(lat: float, lon: float, bearing: float, distance_m: float) -> Tuple[float, float]:
    """출발 좌표에서 방위각/거리만큼 이동한 (위도, 경도) 를 반환한다."""
    ang = distance_m / EARTH_RADIUS_M
    brg = math.radians(bearing)
    lat1, lon1 = math.radians(lat), math.radians(lon)
    lat2 = math.asin(math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(brg))
    lon2 = lon1 + math.atan2(
        math.sin(brg) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540.0) % 360.0 - 180.0
