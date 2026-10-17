"""[US-B1] 로컬 DEM 래스터(GeoTIFF, ERDAS .img 등)에서 고도(m)를 읽는다.

- 환경변수 DEM_DIR 폴더(하위 폴더 포함)의 .tif / .tiff / .img 파일을 모두 읽는다.
  DEM_DIR 이 비어 있으면 DEM 을 쓰지 않고 근사 고도로 동작한다 (기본값).
  저장소에는 파일럿 지역 Copernicus 파일이 backend/data/dem 에 있으며, DEM_DIR=data/dem 으로 켠다
  (상대 경로는 backend 폴더 기준). 다른 자료(국토지리정보원 90m 등)는 각자 받아 다른 폴더를 지정한다.
- 파일의 좌표계는 무엇이든 된다 (위경도, EPSG:5179, EPSG:5186 등). 위경도를 파일 좌표계로 바꿔 읽는다.
- 여러 파일이 같은 지점을 덮으면 **칸이 가장 작은(촘촘한) 파일**을 우선하고, 그 파일에
  값이 없으면(범위 밖, NoData) 다음 파일로 넘어간다.
- 고도는 주변 4칸의 쌍선형 보간으로 구한다. 칸 크기보다 짧은 구간의 경사는 칸 안의
  완만한 기울기로 계산되므로, 큰 오르막·언덕을 거르는 용도에 맞다.
- 자료 출처 (파일럿 지역): Copernicus DEM GLO-30 (약 31m, 건물·나무가 포함된 지표면 모델,
  출처 표기: "Copernicus Digital Elevation Model (DEM) was accessed on 날짜 from
  https://registry.opendata.aws/copernicus-dem"), 국토지리정보원 공개DEM (90m, EPSG:5179).
"""

import logging
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

import numpy as np

try:
    from pyproj import Transformer  # type: ignore[import-not-found, import-untyped]
except ImportError:
    Transformer = None  # type: ignore[assignment, misc]

try:
    import rasterio  # type: ignore[import-not-found, import-untyped]
    from rasterio.errors import RasterioIOError  # type: ignore[import-not-found, import-untyped]
    from rasterio.windows import Window  # type: ignore[import-not-found, import-untyped]
except ImportError:  # DEM 은 선택 기능이다: rasterio 가 없으면 DEM 만 끄고 서버는 근사 고도로 동작한다
    rasterio = None
    RasterioIOError = OSError  # type: ignore[misc, assignment]
    Window = None  # type: ignore[assignment, misc]

logger = logging.getLogger(__name__)

ENV_DEM_DIR = "DEM_DIR"
BACKEND_DIR = Path(__file__).resolve().parents[1]
BUNDLED_DEM_DIR = BACKEND_DIR / "data" / "dem"  # 저장소에 포함된 파일럿 지역 DEM (출처: data/dem/NOTICE.md)
SUPPORTED_SUFFIXES = {".tif", ".tiff", ".img"}
MAX_CELLS_IN_MEMORY = 25_000_000  # 이보다 크면 읽을 때마다 필요한 칸만 읽는다


@dataclass(frozen=True)
class ElevationSample:
    """고도 조회 결과: 값(m), 쓴 파일 이름, 그 파일의 칸 크기(m)."""
    elevation_m: float
    source: str
    resolution_m: float


class _Raster:
    """DEM 파일 하나. 위경도로 고도를 읽는다."""

    def __init__(self, path: Path) -> None:
        if rasterio is None or Transformer is None:
            raise ValueError("rasterio 및 pyproj 가 설치되어 있지 않습니다 (pip install -r backend/requirements.txt)")
        self.path = path
        self.ds = rasterio.open(path)
        if self.ds.crs is None:
            self.ds.close()
            raise ValueError("좌표계 정보가 없는 파일입니다")
        self._geographic = self.ds.crs.is_geographic
        self._to_native = None if self.ds.crs.to_epsg() == 4326 else Transformer.from_crs(
            "EPSG:4326", self.ds.crs, always_xy=True)
        self._inverse = ~self.ds.transform
        self._array: Optional[np.ndarray] = None
        self.resolution_m = self._resolution_in_meters()

    def _resolution_in_meters(self) -> float:
        res_x, res_y = abs(self.ds.res[0]), abs(self.ds.res[1])
        if self._geographic:
            lat = (self.ds.bounds.bottom + self.ds.bounds.top) / 2.0
            return min(res_x * 111320.0 * math.cos(math.radians(lat)), res_y * 110570.0)
        return min(res_x, res_y)

    def _read_block(self, col: int, row: int) -> np.ndarray:
        """(row, col) 에서 시작하는 2x2 칸. NoData/NaN 은 마스크로 표시한다."""
        if self._array is None and self.ds.width * self.ds.height <= MAX_CELLS_IN_MEMORY:
            self._array = self.ds.read(1, masked=True)
        if self._array is not None:
            block = self._array[row:row + 2, col:col + 2]
        else:
            block = self.ds.read(1, window=Window(col, row, 2, 2), masked=True)
        return np.ma.masked_invalid(block)

    def elevation(self, lat: float, lon: float) -> Optional[float]:
        x, y = (lon, lat) if self._to_native is None else self._to_native.transform(lon, lat)
        if not (math.isfinite(x) and math.isfinite(y)):
            return None
        col_f, row_f = self._inverse * (x, y)
        u, v = col_f - 0.5, row_f - 0.5  # 칸 중심 기준 위치
        col, row = math.floor(u), math.floor(v)
        if not (0 <= col <= self.ds.width - 2 and 0 <= row <= self.ds.height - 2):
            return None
        block = self._read_block(col, row)
        if block.shape != (2, 2) or np.ma.count_masked(block) > 0:
            return None
        fc, fr = u - col, v - row
        value = (block[0, 0] * (1 - fc) * (1 - fr) + block[0, 1] * fc * (1 - fr)
                 + block[1, 0] * (1 - fc) * fr + block[1, 1] * fc * fr)
        return float(value)

    def close(self) -> None:
        self.ds.close()


class DemSet:
    """여러 DEM 파일 묶음. 칸이 작은 파일부터 차례로 시도한다."""

    def __init__(self, rasters: Iterable[_Raster], skipped: Optional[List[str]] = None) -> None:
        self.rasters: List[_Raster] = sorted(rasters, key=lambda r: r.resolution_m)
        self.skipped: List[str] = skipped or []

    @classmethod
    def from_paths(cls, paths: Iterable[Path]) -> "DemSet":
        rasters: List[_Raster] = []
        skipped: List[str] = []
        for path in paths:
            try:
                rasters.append(_Raster(Path(path)))
            except (RasterioIOError, ValueError, OSError) as exc:
                skipped.append(f"{Path(path).name}: {type(exc).__name__} {exc}".strip())
        return cls(rasters, skipped)

    @classmethod
    def from_dir(cls, directory: Path) -> "DemSet":
        folder = Path(directory)
        if not folder.is_dir():
            return cls([], [f"{folder.name}: 폴더가 없습니다"])
        return cls.from_paths(sorted(p for p in folder.rglob("*") if p.suffix.lower() in SUPPORTED_SUFFIXES))

    def __bool__(self) -> bool:
        return bool(self.rasters)

    def lookup(self, lat: float, lon: float) -> Optional[ElevationSample]:
        """가장 촘촘한 파일부터 시도해 처음 값이 나오는 파일의 결과를 돌려준다. 없으면 None."""
        if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (lat, lon)):
            raise ValueError(f"lat, lon 은 유한한 숫자여야 합니다: {lat!r}, {lon!r}")
        for raster in self.rasters:
            value = raster.elevation(lat, lon)
            if value is not None:
                return ElevationSample(value, raster.path.name, raster.resolution_m)
        return None

    def elevation(self, lat: float, lon: float) -> Optional[float]:
        sample = self.lookup(lat, lon)
        return None if sample is None else sample.elevation_m

    def close(self) -> None:
        for raster in self.rasters:
            raster.close()


_default: Optional[Tuple[Optional[str], DemSet]] = None


def resolve_dem_dir(value: Optional[str]) -> Optional[Path]:
    """DEM_DIR 값을 폴더 경로로 바꾼다. 상대 경로는 backend 폴더 기준이다 (예: data/dem). 비어 있으면 None."""
    if not value or not value.strip():
        return None
    path = Path(value.strip()).expanduser()
    return path if path.is_absolute() else BACKEND_DIR / path


def get_dem_set() -> DemSet:
    """DEM_DIR 환경변수 기준의 기본 DEM 묶음 (환경변수가 바뀌면 다시 읽는다). 비어 있으면 DEM 을 쓰지 않는다."""
    global _default
    directory = os.getenv(ENV_DEM_DIR) or None
    if _default is None or _default[0] != directory:
        reset_default_dem()
        folder = resolve_dem_dir(directory)
        dem_set = DemSet.from_dir(folder) if folder else DemSet([])
        if dem_set.skipped:
            logger.warning("DEM 파일 %d개를 읽지 못해 건너뜁니다: %s", len(dem_set.skipped), "; ".join(dem_set.skipped[:5]))
        _default = (directory, dem_set)
    return _default[1]


def reset_default_dem() -> None:
    global _default
    if _default is not None:
        _default[1].close()
    _default = None


def get_elevation_m(lat: float, lon: float) -> Optional[float]:
    """기본 DEM 에서 (lat, lon) 의 고도(m). DEM 이 없거나 범위 밖이면 None."""
    return get_dem_set().elevation(lat, lon)
