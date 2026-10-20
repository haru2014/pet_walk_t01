"""[US-B1] 공원 밖 경로가 지나는 OSM 계단(highway=steps) 수를 센다.

- 자료: backend/fixtures/osm_steps_pilot.json (대전·세종 파일럿 범위, scripts/import_osm_steps.py 로 생성)
- 경로가 계단을 '따라' 지날 때만 센다: 계단 길이의 MIN_OVERLAP 이상이 경로에서 ON_ROUTE_TOLERANCE_M 안에 있어야 한다.
  공원 밖 경로(OSRM, overview=full)는 OSM 길 좌표를 그대로 따르므로 실제로 지나면 거의 겹친다.
  계단 옆 경사로·보도를 나란히 지나거나(수 m 떨어짐) 가로지르는 경우는 겹침이 작아 제외된다.
- 경로가 자료 범위 밖으로 나가면 None (알 수 없음). OSM 에 없는 계단은 잡지 못하므로 0 은 '확인된 계단 없음'이다.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from pyproj import Transformer
from shapely.geometry import LineString
from shapely.strtree import STRtree

STEPS_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "osm_steps_pilot.json"
ON_ROUTE_TOLERANCE_M = 2.0
MIN_OVERLAP = 0.6
STEPS_SOURCE = "OpenStreetMap highway=steps (ODbL)"

_to_m = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)  # 미터 단위 평면 좌표 (중부원점)


def _project(coords: Sequence[Sequence[float]]) -> List[Tuple[float, float]]:
    xs, ys = _to_m.transform([c[0] for c in coords], [c[1] for c in coords])
    return list(zip(xs, ys))


@lru_cache(maxsize=1)
def _load():
    """(범위 남·서·북·동, 계단 선 목록, 공간 색인). 파일이 없으면 None."""
    if not STEPS_PATH.exists():
        return None
    data = json.loads(STEPS_PATH.read_text(encoding="utf-8"))
    lines = [LineString(_project(way["coordinates"])) for way in data.get("ways", [])
             if len(way.get("coordinates") or []) >= 2]
    return tuple(data["bbox_south_west_north_east"]), lines, STRtree(lines)


def count_route_steps(coords: Sequence[Sequence[float]]) -> Optional[int]:
    """경로([경도, 위도] 목록)가 따라 지나는 계단 수. 자료가 없거나 경로가 범위 밖이면 None."""
    loaded = _load()
    if loaded is None or len(coords) < 2:
        return None
    (south, west, north, east), lines, tree = loaded
    if not all(west <= c[0] <= east and south <= c[1] <= north for c in coords):
        return None
    corridor = LineString(_project(coords)).buffer(ON_ROUTE_TOLERANCE_M)
    count = 0
    for index in tree.query(corridor):
        step = lines[int(index)]
        if step.length > 0 and step.intersection(corridor).length / step.length >= MIN_OVERLAP:
            count += 1
    return count
