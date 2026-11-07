"""[US-A3] 경로가 다리 없이 물길·철로를 건너는지 검사한다.

막는 선(barrier)은 OSM 의 물길 중심선·물 영역 테두리·철로다(osm_overpass_client.barrier_lines).
그 선을 건너는 수단은 다리·터널로 태그된 길이다(crossing_structures). 경로 구간이 막는 선과
교차하더라도 그 지점이 다리·터널 위라면 정상 횡단으로 본다.

자료를 받지 못했으면(Overpass 장애) 색인이 비어 '모른다'가 되고, 호출자는 경로를 막지 않는 대신
대체 경로임을 사용자에게 알린다(GEMINI.md 원칙 8).
"""

import math
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

from agent.geo_index import LocalProjection, PointGrid, segment_samples
from agent.osm_region import OsmRegion

XY = Tuple[float, float]
Segment = Tuple[XY, XY]

BRIDGE_NEAR_M = 25.0      # 교차 지점이 다리·터널에서 이 거리 안이면 정상 횡단
BARRIER_SEARCH_M = 30.0   # 경로 표본점 주변에서 막는 선을 찾는 반경
ROUTE_SAMPLE_M = 10.0     # 경로 구간을 이 간격으로 훑는다
MIN_SEGMENT_M = 0.5
TOUCH_EPS = 1e-9          # 선 위에 딱 얹힌 점을 한쪽으로 미는 값 (_side 참고)


@dataclass
class BarrierIndex:
    """막는 선과 건너는 수단의 공간 색인. segments 가 비어 있으면 '확인할 자료가 없다'는 뜻이다."""

    projection: LocalProjection
    segments: List[Segment] = field(default_factory=list)
    segment_grid: PointGrid = field(default_factory=lambda: PointGrid(20.0))
    bridge_grid: PointGrid = field(default_factory=lambda: PointGrid(20.0))

    def __bool__(self) -> bool:
        return bool(self.segments)

    def crossing_point(self, coords: Sequence[Sequence[float]]) -> Optional[List[float]]:
        """다리 없이 막는 선을 건너는 첫 지점([경도, 위도]). 없으면 None."""
        if not self.segments or len(coords) < 2:
            return None
        for a, b in zip(coords, coords[1:]):
            hit = self._segment_violation(self.projection.to_xy(a), self.projection.to_xy(b))
            if hit is not None:
                return self._to_lonlat(hit)
        return None

    def crosses(self, coords: Sequence[Sequence[float]]) -> bool:
        return self.crossing_point(coords) is not None

    def _segment_violation(self, a_xy: XY, b_xy: XY) -> Optional[XY]:
        """구간 하나가 막는 선을 건너면 교차점을, 아니면 None."""
        if math.dist(a_xy, b_xy) < MIN_SEGMENT_M:
            return None
        for index in self._nearby_segments(a_xy, b_xy):
            point = _intersection(a_xy, b_xy, *self.segments[index])
            if point is not None and not self.bridge_grid.any_within(point, BRIDGE_NEAR_M):
                return point
        return None

    def _to_lonlat(self, xy: XY) -> List[float]:
        return self.projection.to_lonlat(xy)

    def _nearby_segments(self, a_xy: XY, b_xy: XY) -> List[int]:
        found = set()
        for sample in segment_samples(a_xy, b_xy, ROUTE_SAMPLE_M):
            found.update(self.segment_grid.within(sample, BARRIER_SEARCH_M))
        return sorted(found)


def _cross(o: XY, a: XY, b: XY) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _side(o: XY, p: XY, point: XY) -> float:
    """선 op 를 기준으로 point 가 어느 쪽인지. 선 위(0)는 늘 같은 쪽으로 민다.

    경로 꼭짓점이 강 중심선에 딱 얹히는 일은 흔하다 (강변 보행로, 폴백 직사각형의 꼭짓점).
    0 을 그대로 두면 '닿기만 했다'로 보여 건넌 것을 놓치고, 0 을 건넘으로 세면 강변을
    따라 걷기만 해도 걸린다. 한쪽으로 일관되게 밀면 '넘어간 경우'만 한 번 잡힌다.
    """
    value = _cross(o, p, point)
    return value if value != 0.0 else TOUCH_EPS


def _intersection(a: XY, b: XY, c: XY, d: XY) -> Optional[XY]:
    """선분 ab 와 cd 가 실제로 엇갈릴 때의 교차점. 스치거나 평행하면 None."""
    d1, d2 = _side(c, d, a), _side(c, d, b)
    d3, d4 = _side(a, b, c), _side(a, b, d)
    if d1 * d2 >= 0 or d3 * d4 >= 0:
        return None
    t = d3 / (d3 - d4)
    return (c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t)


def _add_lines(index: BarrierIndex, lines: Sequence[Sequence[Sequence[float]]]) -> None:
    proj = index.projection
    for line in lines:
        points = [proj.to_xy(p) for p in line]
        for a, b in zip(points, points[1:]):
            if math.dist(a, b) < MIN_SEGMENT_M:
                continue
            index.segment_grid.add_line([a, b], len(index.segments), spacing_m=ROUTE_SAMPLE_M)
            index.segments.append((a, b))


def build_barrier_index(region: OsmRegion, projection: Optional[LocalProjection] = None) -> BarrierIndex:
    """OSM 자료에서 막는 선·건너는 수단 색인을 만든다. 자료가 없으면 빈 색인."""
    proj = projection or LocalProjection(region.center)
    index = BarrierIndex(projection=proj)
    _add_lines(index, region.barrier_lines)
    for line in region.crossing_structures:
        index.bridge_grid.add_line([proj.to_xy(p) for p in line], True, spacing_m=ROUTE_SAMPLE_M)
    return index
