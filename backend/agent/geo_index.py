"""경로 탐색용 가벼운 공간 색인 (외부 라이브러리 없이 동작).

출발지 주변 수 km 범위만 다루므로 기준점 중심의 평면 근사(m)로 충분하다.
- LocalProjection: [경도, 위도] ↔ 평면 좌표(m)
- PointGrid: 점 근처 찾기 (격자 버킷)
- point_in_polygon: 짝홀 규칙 내부 판정
"""

import math
from collections import defaultdict
from typing import Dict, Iterable, List, Sequence, Tuple

LonLat = Sequence[float]
XY = Tuple[float, float]

M_PER_DEG_LAT = 110_540.0
M_PER_DEG_LON = 111_320.0


class LocalProjection:
    """기준점 중심의 평면 근사 좌표(m)."""

    def __init__(self, origin: LonLat):
        self.lon0 = float(origin[0])
        self.lat0 = float(origin[1])
        self.kx = M_PER_DEG_LON * math.cos(math.radians(self.lat0))

    def to_xy(self, point: LonLat) -> XY:
        return ((point[0] - self.lon0) * self.kx, (point[1] - self.lat0) * M_PER_DEG_LAT)


def segment_samples(a: XY, b: XY, spacing_m: float) -> List[XY]:
    """선분 위에 spacing_m 간격으로 고른 점 (양 끝 포함)."""
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    count = max(1, int(math.ceil(length / spacing_m)))
    return [(a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count) for i in range(count + 1)]


class PointGrid:
    """점마다 값을 붙여 두고 반경 안의 값을 찾는다."""

    def __init__(self, cell_m: float = 25.0):
        self.cell = cell_m
        self._buckets: Dict[Tuple[int, int], List[Tuple[XY, object]]] = defaultdict(list)

    def __len__(self) -> int:
        return sum(len(items) for items in self._buckets.values())

    def _key(self, xy: XY) -> Tuple[int, int]:
        return int(math.floor(xy[0] / self.cell)), int(math.floor(xy[1] / self.cell))

    def add(self, xy: XY, value: object) -> None:
        self._buckets[self._key(xy)].append((xy, value))

    def add_line(self, points: Iterable[XY], value: object, spacing_m: float = 10.0) -> None:
        """선을 따라 일정 간격으로 같은 값을 넣는다 (선과의 거리를 점 거리로 근사)."""
        pts = list(points)
        for a, b in zip(pts, pts[1:]):
            for sample in segment_samples(a, b, spacing_m):
                self.add(sample, value)

    def within(self, xy: XY, radius_m: float) -> List[object]:
        """반경 안 값 목록 (같은 값이 여러 번 나올 수 있다)."""
        reach = int(math.ceil(radius_m / self.cell))
        cx, cy = self._key(xy)
        found: List[object] = []
        limit = radius_m * radius_m
        for gx in range(cx - reach, cx + reach + 1):
            for gy in range(cy - reach, cy + reach + 1):
                for pt, value in self._buckets.get((gx, gy), ()):
                    if (pt[0] - xy[0]) ** 2 + (pt[1] - xy[1]) ** 2 <= limit:
                        found.append(value)
        return found

    def any_within(self, xy: XY, radius_m: float) -> bool:
        return bool(self.within(xy, radius_m))


def point_in_polygon(xy: XY, ring: Sequence[XY]) -> bool:
    """짝홀 규칙 내부 판정. ring 은 닫히지 않아도 된다."""
    inside = False
    count = len(ring)
    for i in range(count):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % count]
        if (y1 > xy[1]) != (y2 > xy[1]):
            cross_x = x1 + (xy[1] - y1) * (x2 - x1) / (y2 - y1)
            if xy[0] < cross_x:
                inside = not inside
    return inside


class PolygonSet:
    """여러 다각형에 대해 '이 점이 어느 하나에라도 들어가는가'를 묻는다 (경계 상자로 먼저 거른다)."""

    def __init__(self) -> None:
        self._items: List[Tuple[Tuple[float, float, float, float], List[XY]]] = []

    def __len__(self) -> int:
        return len(self._items)

    def add(self, ring: Sequence[XY]) -> None:
        if len(ring) < 3:
            return
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        self._items.append(((min(xs), min(ys), max(xs), max(ys)), list(ring)))

    def rings(self) -> List[List[XY]]:
        return [ring for _bbox, ring in self._items]

    def contains(self, xy: XY) -> bool:
        for (x0, y0, x1, y1), ring in self._items:
            if x0 <= xy[0] <= x1 and y0 <= xy[1] <= y1 and point_in_polygon(xy, ring):
                return True
        return False
