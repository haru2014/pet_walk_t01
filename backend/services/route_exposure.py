"""[US-B3, US-20] 경로가 실제로 차도·횡단보도·쉼터와 얼마나 맞닿는지 잰다 (카드·안내 문구의 근거).

- road_exposure_ratio: 골목·큰길 위 또는 그 옆을 걷는 길이 비율 (0~1)
- major_road_ratio: 그중 큰길(3차로급 이상) 위 또는 옆 비율
- crossing_count: 지나는 OSM 횡단 지점 수
- rest_spot_count: 경로 30m 안의 벤치·쉼터·음수대·화장실 수
OSM 그래프와 맞춰 본 길이가 경로의 절반에 못 미치면 비율은 None (모름)으로 둔다. 숫자를 지어내지 않는다.
"""

from collections import Counter
from typing import Any, Dict, List, Optional, Sequence

from agent.geo_index import segment_samples
from agent.osm_walk_graph import WalkGraph
from agent.route_geometry import haversine_m

EDGE_MATCH_M = 8.0
CROSSING_NEAR_M = 5.0
REST_NEAR_M = 30.0
MIN_MATCHED_RATIO = 0.5
SAMPLE_SPACING_M = 5.0
EMPTY: Dict[str, Any] = {
    "road_exposure_ratio": None, "major_road_ratio": None, "crossing_count": None,
    "rest_spot_count": None, "exposure_source": None,
}


def _key(point: Sequence[float]):
    return (round(float(point[0]), 7), round(float(point[1]), 7))


def _edge_attrs(walk: WalkGraph, a, b) -> Optional[Dict[str, Any]]:
    """경로 구간에 해당하는 그래프 간선 속성. 같은 좌표가 아니면 가까운 간선 표본점으로 찾는다."""
    data = walk.graph.get_edge_data(_key(a), _key(b))
    if data is not None:
        return data
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    hits = walk.edge_grid.within(walk.projection.to_xy(mid), EDGE_MATCH_M)
    if not hits:
        return None
    u, v = Counter(hits).most_common(1)[0][0]
    return walk.graph.get_edge_data(u, v)


def _road_lengths(walk: WalkGraph, coords: Sequence[Sequence[float]]) -> Dict[str, float]:
    lengths = {"total": 0.0, "matched": 0.0, "road": 0.0, "major": 0.0}
    for a, b in zip(coords, coords[1:]):
        length = haversine_m(a, b)
        lengths["total"] += length
        attrs = _edge_attrs(walk, a, b)
        if attrs is None:
            continue
        lengths["matched"] += length
        context = attrs.get("road_context")
        if context in ("minor", "major"):
            lengths["road"] += length
        if context == "major":
            lengths["major"] += length
    return lengths


def _route_samples(walk: WalkGraph, coords: Sequence[Sequence[float]]) -> List:
    projected = [walk.projection.to_xy(c) for c in coords]
    samples: List = []
    for a, b in zip(projected, projected[1:]):
        samples.extend(segment_samples(a, b, SAMPLE_SPACING_M))
    return samples


def _nearby_count(grid, samples: Sequence, radius_m: float) -> int:
    found = set()
    for xy in samples:
        found.update(grid.within(xy, radius_m))
    return len(found)


def measure_route_exposure(coords: Sequence[Sequence[float]], walk: Optional[WalkGraph]) -> Dict[str, Any]:
    """좌표열([경도, 위도])의 차도·횡단·쉼터 지표. 그래프가 없으면 모두 None."""
    if walk is None or len(coords) < 2:
        return dict(EMPTY)
    lengths = _road_lengths(walk, coords)
    samples = _route_samples(walk, coords)
    result = dict(EMPTY)
    result.update(
        crossing_count=_nearby_count(walk.crossing_grid, samples, CROSSING_NEAR_M),
        rest_spot_count=_nearby_count(walk.rest_grid, samples, REST_NEAR_M),
        exposure_source=walk.source,
    )
    if lengths["total"] > 0 and lengths["matched"] / lengths["total"] >= MIN_MATCHED_RATIO:
        result.update(
            road_exposure_ratio=round(lengths["road"] / lengths["matched"], 3),
            major_road_ratio=round(lengths["major"] / lengths["matched"], 3),
        )
    return result
