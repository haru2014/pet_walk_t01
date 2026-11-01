"""[US-B2] 위성 토지피복(ESA WorldCover 2021, 10m)으로 경로의 '나무 가까이' 비율을 구한다 (그늘 1단계).

- 자료: backend/data/landcover/esa_worldcover_2021_v200_daejeon_sejong.tif (출처·한계: 같은 폴더 NOTICE.md)
- 나무 덮개(분류값 10) 칸과 그 주변 1칸(약 10m)을 '나무 가까이'로 본다. 길가 나무도 그늘을 만들기 때문이다.
- 경로를 5m 간격으로 나눠 각 조각이 '나무 가까이' 칸에 있는지 세어 길이 비율을 낸다.
- 해 방향·시간대는 반영하지 않는다 (시간대별 그림자는 2단계).
- rasterio 가 없거나 파일을 읽을 수 없거나 경로가 자료 범위 밖이면 None (알 수 없음).
"""

import logging
from pathlib import Path
from typing import Optional, Sequence

import numpy as np

from agent.route_geometry import haversine_m

try:
    import rasterio  # type: ignore[import-not-found, import-untyped]
except ImportError:  # 토지피복은 선택 기능이다: 없으면 그늘만 '알 수 없음'
    rasterio = None

logger = logging.getLogger(__name__)

LANDCOVER_PATH = Path(__file__).resolve().parents[1] / "data" / "landcover" / "esa_worldcover_2021_v200_daejeon_sejong.tif"
TREE_COVER_CLASS = 10
SAMPLE_STEP_M = 5.0
LANDCOVER_SOURCE = "ESA WorldCover 2021 (10m, CC BY 4.0)"
LANDCOVER_ATTRIBUTION = ("© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) "
                         "processed by ESA WorldCover consortium")

_cache: Optional[tuple] = None  # (나무 가까이 격자, 역변환) 또는 (None, None)


def _load():
    global _cache
    if _cache is None:
        _cache = (None, None)
        if rasterio is None:
            logger.warning("rasterio 가 없어 그늘(토지피복)을 계산하지 않습니다")
        elif LANDCOVER_PATH.exists():
            try:
                with rasterio.open(LANDCOVER_PATH) as ds:
                    tree = ds.read(1) == TREE_COVER_CLASS
                    inverse = ~ds.transform
                padded = np.pad(tree, 1)
                near = np.zeros_like(tree)
                for dr in (-1, 0, 1):
                    for dc in (-1, 0, 1):
                        near |= padded[1 + dr:1 + dr + tree.shape[0], 1 + dc:1 + dc + tree.shape[1]]
                _cache = (near, inverse)
            except (OSError, ValueError) as exc:
                logger.warning("토지피복 파일을 읽지 못했습니다: %s", exc)
    return _cache


def reset_landcover_cache() -> None:
    global _cache
    _cache = None


def near_tree_ratio(coords: Sequence[Sequence[float]]) -> Optional[float]:
    """경로([경도, 위도] 목록) 길이 중 나무 덮개 칸 10m 안을 지나는 비율(0~1). 계산할 수 없으면 None."""
    near, inverse = _load()
    if near is None or len(coords) < 2:
        return None
    rows, cols = near.shape
    total = hit = 0.0
    for a, b in zip(coords, coords[1:]):
        length = haversine_m(a, b)
        pieces = max(1, int(length / SAMPLE_STEP_M))
        for i in range(pieces):
            t = (i + 0.5) / pieces
            col, row = inverse * (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            row, col = int(row), int(col)
            if not (0 <= row < rows and 0 <= col < cols):
                return None  # 자료 범위 밖 구간이 있으면 비율을 믿을 수 없다
            piece = length / pieces
            total += piece
            hit += piece * bool(near[row, col])
    return round(hit / total, 3) if total else None
