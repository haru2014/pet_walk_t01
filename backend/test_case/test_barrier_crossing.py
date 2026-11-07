"""[US-A3] 다리 없는 물길·철로 횡단 차단 검증.

운영 QA: 현재 위치 기반 코스가 다리가 없는 강을 건너라고 안내하는 일이 있었다.
원인은 두 가지였다.
1. Overpass 질의가 물길·철로를 아예 받지 않아 검증할 자료가 없었다
2. 실제 길 기반 후보가 0개이면 목표 거리에 맞춘 직사각형을 그대로 돌려줬다 (강·철로 관통)

가상 지형 (기준점 경도 127.0, 위도 36.0, 단위 m):
- x=0 남북 방향 강(waterway=river), y=300 에만 보행 가교(highway=footway, bridge=yes)
- y=-200 동서 방향 철로(railway=rail)
"""

import math

import pytest

from agent.fallback_rectangle import plan_fallback_rectangle, rectangle_coords
from agent.osm_region import parse_overpass
from agent.route_barriers import build_barrier_index

LON0, LAT0 = 127.0, 36.0
KX = 111_320.0 * math.cos(math.radians(LAT0))
KY = 110_540.0


def p(x: float, y: float):
    return [LON0 + x / KX, LAT0 + y / KY]


def line(points, step=20.0):
    out = []
    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        n = max(1, int(math.hypot(x2 - x1, y2 - y1) // step))
        out.extend(p(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n))
    out.append(p(*points[-1]))
    return out


def geom(points):
    return [{"lon": c[0], "lat": c[1]} for c in points]


def element(eid, tags, points):
    return {"type": "way", "id": eid, "tags": tags, "geometry": geom(points)}


@pytest.fixture
def region():
    payload = {"elements": [
        element(1, {"waterway": "river"}, [p(0, -800), p(0, 800)]),
        element(2, {"highway": "footway", "bridge": "yes"}, [p(-40, 300), p(40, 300)]),
        element(3, {"railway": "rail"}, [p(-800, -200), p(800, -200)]),
    ], "osm3s": {"timestamp_osm_base": "2026-11-01T00:00:00Z"}}
    return parse_overpass(payload, (LON0, LAT0), 1200.0)


@pytest.fixture
def barriers(region):
    return build_barrier_index(region)


def test_water_and_rail_are_collected_as_barriers(region):
    """1. 물길·철로는 막는 선으로, 다리는 건너는 수단으로 나뉘어 담긴다."""
    assert len(region.barrier_lines) == 2       # 강 + 철로
    assert len(region.crossing_structures) == 1  # 보행 가교
    assert region.osm_base == "2026-11-01T00:00:00Z"


def test_culvert_water_is_not_a_barrier():
    """2. 암거(터널)로 지나는 물길은 위로 건널 수 있어 막는 선이 아니다."""
    piped = parse_overpass({"elements": [
        element(9, {"waterway": "stream", "tunnel": "culvert"}, [p(0, -100), p(0, 100)]),
    ]}, (LON0, LAT0), 600.0)
    assert piped.barrier_lines == []


def test_crossing_without_bridge_is_detected(barriers):
    """3. 다리가 없는 곳에서 강을 건너는 경로는 걸러진다."""
    assert barriers
    assert barriers.crosses(line([(-150, 0), (150, 0)]))
    point = barriers.crossing_point(line([(-150, 0), (150, 0)]))
    assert point is not None and abs(point[0] - LON0) < 2e-4


def test_crossing_on_bridge_is_allowed(barriers):
    """4. 보행 가교 위에서 건너는 경로는 통과한다."""
    assert not barriers.crosses(line([(-150, 300), (150, 300)]))


def test_route_touching_riverside_is_not_flagged(barriers):
    """5. 강변을 따라 걷다 중심선에 닿기만 하고 돌아오는 경로는 건넌 것이 아니다."""
    assert not barriers.crosses(line([(-150, 0), (0, 0), (-150, 0)]))
    assert not barriers.crosses(line([(-400, -100), (-150, -100)]))


def test_railway_crossing_is_detected(barriers):
    """6. 철로 횡단도 같은 기준으로 걸러진다."""
    assert barriers.crosses(line([(-300, -400), (-300, -50)]))


def test_fallback_rectangle_avoids_barriers(barriers):
    """7. 직사각형 대체 코스는 막는 선을 건너지 않는 모양을 찾아 쓴다."""
    coords = plan_fallback_rectangle(LAT0, LON0, 1200.0, 1, barriers)
    assert coords is not None
    assert not barriers.crosses(coords)


def test_fallback_rectangle_gives_up_when_boxed_in():
    """8. 어떤 모양도 막는 선을 피할 수 없으면 후보를 만들지 않는다 (강 건너라고 하지 않는다)."""
    walls = {"elements": [
        element(11, {"waterway": "river"}, [p(-120, -2000), p(-120, 2000)]),
        element(12, {"waterway": "river"}, [p(120, -2000), p(120, 2000)]),
        element(13, {"waterway": "river"}, [p(-2000, -120), p(2000, -120)]),
        element(14, {"waterway": "river"}, [p(-2000, 120), p(2000, 120)]),
    ]}
    boxed = build_barrier_index(parse_overpass(walls, (LON0, LAT0), 2500.0))
    assert plan_fallback_rectangle(LAT0, LON0, 1200.0, 1, boxed) is None


def test_fallback_rectangle_without_data_keeps_previous_behaviour():
    """9. 막는 선 자료를 못 받았으면 예전처럼 그린다 (호출자가 대체 경로임을 알린다)."""
    coords = plan_fallback_rectangle(LAT0, LON0, 1200.0, 2, None)
    assert coords is not None and len(coords) > 4


def test_rectangle_perimeter_matches_target():
    """10. 직사각형 둘레는 목표 거리에 맞는다 (모양·회전을 바꿔도 길이는 유지)."""
    for aspect, rotation in ((0.6, 0.0), (1.0, 90.0), (1.6, 225.0)):
        coords = rectangle_coords(LAT0, LON0, 1200.0, aspect, rotation)
        total = sum(
            math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY)
            for a, b in zip(coords, coords[1:])
        )
        assert abs(total - 1200.0) <= 30.0, f"aspect={aspect} rotation={rotation} 둘레={total:.0f}m"
