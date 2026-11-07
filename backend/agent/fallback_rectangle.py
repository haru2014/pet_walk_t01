"""[US-A3] 실제 길 기반 후보가 하나도 없을 때만 쓰는 기하학적 순환 코스 (마지막 수단).

도로망 정보가 없으므로 건물을 관통할 수 있고, 예전에는 다리 없는 강·철로까지 가로질렀다.
그래서 이제는 물길·철로 색인(agent/route_barriers)으로 걸러 낸다.
- 비율·회전 각도를 여러 가지로 그려 보고, 막는 선을 건너지 않는 첫 모양을 쓴다
- 전부 건너면 그 후보는 만들지 않는다 (강을 건너라고 안내하는 것보다 후보가 적은 편이 낫다)
- 막는 선 자료 자체를 못 받았으면 모양을 그대로 쓰되, 호출자가 '대체 경로'임을 사용자에게 알린다
  (GEMINI.md 원칙 8 · services/course_notices.FALLBACK_NOTICE)
"""

import math
from typing import List, Optional, Tuple

from agent.route_barriers import BarrierIndex
from agent.route_geometry import destination_point, haversine_m

EDGE_SPACING_M = 25.0
# 후보별 기본 세로/가로 비율. 같은 자리에서 후보 3개가 서로 다른 모양이 되게 한다.
ASPECT_RATIOS = {1: 0.6, 2: 1.0, 3: 1.6}
# 막는 선에 걸렸을 때 바꿔 볼 (비율, 회전 각도). 비율을 바꿔도 안 되면 방향을 돌려 본다.
SHAPE_RETRIES: Tuple[Tuple[float, float], ...] = (
    (1.0, 0.0), (0.6, 90.0), (1.6, 180.0), (1.0, 270.0), (0.8, 45.0), (1.25, 225.0),
)


def _densify(start: List[float], end: List[float]) -> List[List[float]]:
    """[경도, 위도] 두 점 사이를 약 25m 간격으로 보간한다 (끝점 제외)."""
    count = max(1, math.ceil(haversine_m(start, end) / EDGE_SPACING_M))
    return [
        [start[0] + (end[0] - start[0]) * i / count, start[1] + (end[1] - start[1]) * i / count]
        for i in range(count)
    ]


def _corner(lat: float, lon: float, bearing: float, distance_m: float) -> List[float]:
    moved_lat, moved_lon = destination_point(lat, lon, bearing, distance_m)
    return [moved_lon, moved_lat]


def rectangle_coords(origin_lat: float, origin_lon: float, target_distance_m: float,
                     aspect: float, rotation_deg: float = 0.0) -> List[List[float]]:
    """출발지를 한 꼭짓점으로 하고 둘레가 목표 거리인 직사각형 순환 좌표열."""
    width = target_distance_m / (2 * (1 + aspect))
    height = width * aspect
    origin = [origin_lon, origin_lat]
    side = _corner(origin_lat, origin_lon, rotation_deg, height)
    far = _corner(side[1], side[0], rotation_deg + 90.0, width)
    near = _corner(origin_lat, origin_lon, rotation_deg + 90.0, width)
    corners = [origin, side, far, near]
    coords: List[List[float]] = []
    for index, point in enumerate(corners):
        coords.extend(_densify(point, corners[(index + 1) % len(corners)]))
    coords.append(list(origin))
    return coords


def plan_fallback_rectangle(origin_lat: float, origin_lon: float, target_distance_m: float,
                            variant: int, barriers: Optional[BarrierIndex] = None) -> Optional[List[List[float]]]:
    """막는 선을 건너지 않는 직사각형 좌표열. 모든 모양이 걸리면 None."""
    shapes = [(ASPECT_RATIOS[variant], 0.0), *SHAPE_RETRIES]
    for aspect, rotation in shapes:
        coords = rectangle_coords(origin_lat, origin_lon, target_distance_m, aspect, rotation)
        if barriers is None or not barriers or not barriers.crosses(coords):
            return coords
    return None
