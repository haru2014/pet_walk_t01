"""[US-B1] 로컬 DEM 래스터 고도 조회(services/dem.py) TDD 테스트.

실제 DEM 파일 없이 검증하도록 테스트가 평면 지형의 GeoTIFF 를 직접 만든다.
(평면 지형은 쌍선형 보간 결과가 정확히 계산되므로 기대값을 수식으로 구할 수 있다.)

1. 읽기: 위경도 파일, 투영 좌표계(EPSG:5179) 파일, 방향(북쪽으로 갈수록 +), 경계.
2. 여러 파일: 가장 촘촘한 파일 우선, 범위 밖/NoData 이면 다음 파일.
3. 폴더 읽기: 하위 폴더, 확장자, 깨진 파일 건너뛰기, ERDAS .img.
4. 기본 DEM(DEM_DIR): 환경변수 변경, 비어 있음.
5. 연결: estimate_elevation_m 이 실제 DEM 을 먼저 쓰고, 없으면 근사 모델로 대신.
6. 저장소 포함 파일(backend/data/dem): 읽기, 파일럿 지점 고도, 출처 고지 파일, DEM_DIR 상대 경로.
7. 실제 파일 시험(로컬 전용): REAL_DEM_DIR=/폴더 pytest backend/test_case/test_dem.py -k RealDem
"""

import math
import os
from pathlib import Path

import numpy as np
import pytest
import rasterio
from affine import Affine
from pyproj import Transformer
from rasterio.errors import RasterioIOError

from agent.surface_slope_evaluator import (
    MIN_SLOPE_BASELINE_M,
    calculate_segment_slope_percent,
    estimate_elevation_m,
    evaluate_route_metrics,
)
from services import dem
from services.dem import DemSet

REAL_DEM_DIR = os.getenv("REAL_DEM_DIR")  # conftest 는 DEM_DIR 만 비우므로 이 값은 그대로 남는다
TO_5179 = Transformer.from_crs("EPSG:4326", "EPSG:5179", always_xy=True)


@pytest.fixture(autouse=True)
def _isolate_default_dem(monkeypatch):
    """기본 DEM(DEM_DIR)을 테스트마다 비워서 개발자 컴퓨터의 실제 파일에 영향받지 않게 한다."""
    monkeypatch.setenv(dem.ENV_DEM_DIR, "")
    dem.reset_default_dem()
    yield
    dem.reset_default_dem()


def plane(lon, lat):
    """위경도 평면 지형: 동쪽 1도당 2000m, 북쪽 1도당 1000m 오른다."""
    return 100.0 + 2000.0 * (lon - 127.0) + 1000.0 * (lat - 36.4)


def write_geographic(path, *, res=0.001, size=100, lon0=127.0, lat_top=36.5, fn=plane, nodata=None,
                     nodata_cells=(), nan_cells=(), driver="GTiff"):
    cols = lon0 + (np.arange(size) + 0.5) * res
    rows = lat_top - (np.arange(size) + 0.5) * res
    lon, lat = np.meshgrid(cols, rows)
    data = np.asarray(fn(lon, lat), dtype="float32")
    for r, c in nodata_cells:
        data[r, c] = nodata
    for r, c in nan_cells:
        data[r, c] = np.nan
    with rasterio.open(path, "w", driver=driver, height=size, width=size, count=1, dtype="float32",
                       crs="EPSG:4326", transform=Affine.translation(lon0, lat_top) * Affine.scale(res, -res),
                       nodata=nodata) as dst:
        dst.write(data, 1)
    return path


def constant(value):
    return lambda lon, lat: np.full_like(lon, value, dtype="float64")


class TestGeographicRaster:
    def test_bilinear_interpolation_is_exact_on_a_plane(self, tmp_path):
        s = DemSet.from_paths([write_geographic(tmp_path / "a.tif")])
        for lon, lat in [(127.0333, 36.4517), (127.0999 - 0.001, 36.4011), (127.05, 36.45), (127.0015, 36.4985)]:
            assert s.elevation(lat, lon) == pytest.approx(plane(lon, lat), abs=0.02)

    def test_north_is_up_and_east_is_right(self, tmp_path):
        s = DemSet.from_paths([write_geographic(tmp_path / "a.tif")])
        base = s.elevation(36.45, 127.05)
        assert s.elevation(36.46, 127.05) - base == pytest.approx(10.0, abs=0.05)   # 북쪽 0.01도 = +10m
        assert s.elevation(36.45, 127.06) - base == pytest.approx(20.0, abs=0.05)   # 동쪽 0.01도 = +20m

    def test_resolution_in_meters_uses_the_shorter_axis(self, tmp_path):
        s = DemSet.from_paths([write_geographic(tmp_path / "a.tif", res=0.001)])
        expected = 0.001 * 111320.0 * math.cos(math.radians(36.45))  # 경도 방향이 위도 방향보다 짧다
        assert s.rasters[0].resolution_m == pytest.approx(expected, rel=0.01)

    def test_points_outside_or_on_the_border_return_none(self, tmp_path):
        s = DemSet.from_paths([write_geographic(tmp_path / "a.tif")])  # 경도 127.0~127.1, 위도 36.4~36.5
        assert s.elevation(36.45, 126.9) is None and s.elevation(36.45, 127.2) is None
        assert s.elevation(36.6, 127.05) is None and s.elevation(36.3, 127.05) is None
        # 가장자리 반 칸(0.0005도) 안쪽은 주변 4칸을 채울 수 없어 None, 한 칸 안쪽부터는 값이 나온다
        assert s.elevation(36.45, 127.0002) is None
        assert s.elevation(36.45, 127.0006) is not None

    def test_float32_values_are_returned_as_python_float(self, tmp_path):
        value = DemSet.from_paths([write_geographic(tmp_path / "a.tif", fn=constant(55.5))]).elevation(36.45, 127.05)
        assert type(value) is float and value == pytest.approx(55.5)


class TestProjectedRaster:
    @staticmethod
    def write(path):
        x0, y_top = TO_5179.transform(127.0, 36.5)
        size, res = 400, 30.0
        cols = x0 + (np.arange(size) + 0.5) * res
        rows = y_top - (np.arange(size) + 0.5) * res
        x, y = np.meshgrid(cols, rows)
        z = (50.0 + 0.01 * (x - x0) + 0.02 * (y - y_top)).astype("float32")
        with rasterio.open(path, "w", driver="GTiff", height=size, width=size, count=1, dtype="float32",
                           crs="EPSG:5179", transform=Affine.translation(x0, y_top) * Affine.scale(res, -res)) as dst:
            dst.write(z, 1)
        return path, x0, y_top

    def test_coordinates_are_converted_to_the_file_crs(self, tmp_path):
        path, x0, y_top = self.write(tmp_path / "p.tif")
        s = DemSet.from_paths([path])
        for lon, lat in [(127.02, 36.46), (127.04, 36.44), (127.015, 36.48)]:
            x, y = TO_5179.transform(lon, lat)
            assert s.elevation(lat, lon) == pytest.approx(50.0 + 0.01 * (x - x0) + 0.02 * (y - y_top), abs=0.02)

    def test_resolution_is_taken_from_the_projected_cell_size(self, tmp_path):
        path, _, _ = self.write(tmp_path / "p.tif")
        assert DemSet.from_paths([path]).rasters[0].resolution_m == pytest.approx(30.0)

    def test_orientation_in_a_projected_file(self, tmp_path):
        path, _, _ = self.write(tmp_path / "p.tif")
        s = DemSet.from_paths([path])
        south, north = s.elevation(36.45, 127.03), s.elevation(36.451, 127.03)
        assert north > south and (north - south) == pytest.approx(0.02 * 111.0, abs=0.1)  # 북쪽 약 111m, 기울기 2%


class TestMultipleRasters:
    @pytest.fixture
    def pair(self, tmp_path):
        coarse = write_geographic(tmp_path / "coarse.tif", res=0.002, size=100, lon0=127.0, lat_top=36.6, fn=constant(100.0))
        fine = write_geographic(tmp_path / "fine.tif", res=0.0005, size=100, lon0=127.05, lat_top=36.45, fn=constant(200.0))
        return DemSet.from_paths([coarse, fine])

    def test_finest_raster_is_tried_first(self, pair):
        assert [r.path.name for r in pair.rasters] == ["fine.tif", "coarse.tif"]
        sample = pair.lookup(36.43, 127.07)  # 촘촘한 파일 안
        assert (sample.elevation_m, sample.source) == (pytest.approx(200.0), "fine.tif")
        assert sample.resolution_m < 60

    def test_falls_back_to_the_coarser_raster_outside_the_fine_one(self, pair):
        sample = pair.lookup(36.55, 127.15)  # 촘촘한 파일 밖, 거친 파일 안
        assert (sample.elevation_m, sample.source) == (pytest.approx(100.0), "coarse.tif")

    def test_none_when_no_raster_covers_the_point(self, pair):
        assert pair.lookup(37.5, 126.9) is None and pair.elevation(37.5, 126.9) is None

    def test_nodata_in_the_fine_raster_falls_back_to_the_coarse_one(self, tmp_path):
        coarse = write_geographic(tmp_path / "coarse.tif", res=0.002, size=100, lon0=127.0, lat_top=36.6, fn=constant(100.0))
        fine = write_geographic(tmp_path / "fine.tif", res=0.0005, size=100, lon0=127.05, lat_top=36.45,
                                fn=constant(200.0), nodata=-9999.0, nodata_cells=[(40, 40)])
        s = DemSet.from_paths([coarse, fine])
        lat = 36.45 - 40.5 * 0.0005  # NoData 칸의 중심 (행 40, 열 40)
        lon = 127.05 + 40.5 * 0.0005
        assert s.lookup(lat, lon).source == "coarse.tif"
        assert s.lookup(36.41, 127.09).source == "fine.tif"  # NoData 칸에서 먼 곳은 영향 없음

    def test_nan_cells_are_treated_as_missing_even_without_nodata(self, tmp_path):
        only = write_geographic(tmp_path / "a.tif", fn=constant(10.0), nan_cells=[(50, 50)])
        s = DemSet.from_paths([only])
        assert s.elevation(36.45 - 50.5 * 0.001, 127.0 + 50.5 * 0.001) is None
        assert s.elevation(36.42, 127.02) == pytest.approx(10.0)


class TestDirectoryLoading:
    def test_reads_tif_and_tiff_recursively_and_ignores_other_files(self, tmp_path):
        write_geographic(tmp_path / "a.tif", fn=constant(1.0))
        (tmp_path / "sub").mkdir()
        write_geographic(tmp_path / "sub" / "b.TIFF", fn=constant(2.0), lon0=127.2)
        (tmp_path / "readme.txt").write_text("not a raster")
        s = DemSet.from_dir(tmp_path)
        assert sorted(r.path.name for r in s.rasters) == ["a.tif", "b.TIFF"] and s.skipped == []

    def test_broken_files_are_skipped_and_reported(self, tmp_path):
        write_geographic(tmp_path / "good.tif", fn=constant(1.0))
        (tmp_path / "broken.tif").write_text("this is not a tiff")
        s = DemSet.from_dir(tmp_path)
        assert [r.path.name for r in s.rasters] == ["good.tif"]
        assert len(s.skipped) == 1 and s.skipped[0].startswith("broken.tif")

    def test_file_without_crs_is_skipped(self, tmp_path):
        with rasterio.open(tmp_path / "nocrs.tif", "w", driver="GTiff", height=4, width=4, count=1,
                           dtype="float32", transform=Affine.translation(127, 36) * Affine.scale(0.001, -0.001)) as dst:
            dst.write(np.ones((4, 4), dtype="float32"), 1)
        s = DemSet.from_dir(tmp_path)
        assert not s and s.skipped[0].startswith("nocrs.tif")

    def test_missing_folder_gives_an_empty_set_with_a_note(self, tmp_path):
        s = DemSet.from_dir(tmp_path / "missing")
        assert not s and s.elevation(36.4, 127.4) is None and "폴더가 없습니다" in s.skipped[0]

    def test_empty_folder_gives_an_empty_set(self, tmp_path):
        assert not DemSet.from_dir(tmp_path)

    def test_erdas_img_files_are_read(self, tmp_path):
        try:
            write_geographic(tmp_path / "sheet.img", fn=constant(33.3), driver="HFA")
        except RasterioIOError:
            pytest.skip("이 GDAL 에는 ERDAS(.img) 쓰기 드라이버가 없다")
        s = DemSet.from_dir(tmp_path)
        assert s.elevation(36.45, 127.05) == pytest.approx(33.3, abs=0.01)

    def test_large_files_are_read_block_by_block(self, tmp_path, monkeypatch):
        path = write_geographic(tmp_path / "a.tif")
        in_memory = DemSet.from_paths([path]).elevation(36.4517, 127.0333)
        monkeypatch.setattr(dem, "MAX_CELLS_IN_MEMORY", 1)
        windowed = DemSet.from_paths([path])
        assert windowed.rasters[0]._array is None
        assert windowed.elevation(36.4517, 127.0333) == pytest.approx(in_memory, abs=1e-6)
        assert windowed.rasters[0]._array is None  # 전체를 메모리에 올리지 않았다


class TestInputValidation:
    @pytest.mark.parametrize("lat, lon", [(None, 127.0), (36.0, None), ("36", 127.0), (float("nan"), 127.0),
                                          (36.0, float("inf")), (True, 127.0)])
    def test_invalid_coordinates_raise(self, tmp_path, lat, lon):
        s = DemSet.from_paths([write_geographic(tmp_path / "a.tif")])
        with pytest.raises(ValueError):
            s.lookup(lat, lon)


class TestDefaultDem:
    def test_without_dem_dir_there_is_no_elevation(self):
        assert not dem.get_dem_set() and dem.get_elevation_m(36.45, 127.05) is None

    def test_dem_dir_enables_the_default_set(self, tmp_path, monkeypatch):
        write_geographic(tmp_path / "a.tif", fn=constant(77.7))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        assert dem.get_elevation_m(36.45, 127.05) == pytest.approx(77.7)

    def test_changing_dem_dir_reloads(self, tmp_path, monkeypatch):
        one, two = tmp_path / "one", tmp_path / "two"
        one.mkdir(); two.mkdir()
        write_geographic(one / "a.tif", fn=constant(1.0))
        write_geographic(two / "a.tif", fn=constant(2.0))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(one))
        assert dem.get_elevation_m(36.45, 127.05) == pytest.approx(1.0)
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(two))
        assert dem.get_elevation_m(36.45, 127.05) == pytest.approx(2.0)
        monkeypatch.setenv(dem.ENV_DEM_DIR, "")
        assert dem.get_elevation_m(36.45, 127.05) is None

    def test_default_set_is_cached_between_calls(self, tmp_path, monkeypatch):
        write_geographic(tmp_path / "a.tif", fn=constant(5.0))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        assert dem.get_dem_set() is dem.get_dem_set()


class TestWiringIntoSlopeEvaluator:
    """services.dem 이 agent.surface_slope_evaluator 의 고도·경사 계산에 연결되는지."""

    def test_real_dem_is_used_when_it_covers_the_point(self, tmp_path, monkeypatch):
        write_geographic(tmp_path / "a.tif", lon0=127.30, lat_top=36.40, fn=constant(77.7))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        assert estimate_elevation_m(127.35, 36.35) == 77.7

    def test_falls_back_to_the_approximation_outside_the_dem(self, tmp_path, monkeypatch):
        seoul_before = estimate_elevation_m(126.978, 37.566)
        write_geographic(tmp_path / "a.tif", lon0=127.30, lat_top=36.40, fn=constant(77.7))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        assert estimate_elevation_m(126.978, 37.566) == seoul_before != 77.7

    def test_segment_slope_follows_the_dem_gradient(self, tmp_path, monkeypatch):
        """북쪽으로 100m 가면 10m 오르는 지형(10%)에서 구간 경사가 약 10% 로 계산되는지."""
        write_geographic(tmp_path / "a.tif", lon0=127.30, lat_top=36.40,
                         fn=lambda lon, lat: 100.0 + 11119.5 * (lat - 36.30))
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        slope = calculate_segment_slope_percent([127.35, 36.35], [127.35, 36.3509])
        assert slope == pytest.approx(10.0, abs=0.3)
        flat = calculate_segment_slope_percent([127.35, 36.35], [127.3509, 36.35])  # 동서 방향은 평지
        assert flat == pytest.approx(0.0, abs=0.3)


class TestWithoutRasterio:
    """DEM 은 선택 기능이다: rasterio 가 없어도 서버는 뜨고, DEM 만 꺼진 채 근사 고도로 동작해야 한다."""

    def test_missing_rasterio_disables_the_dem_instead_of_crashing(self, tmp_path, monkeypatch):
        write_geographic(tmp_path / "a.tif", fn=constant(77.7))
        monkeypatch.setattr(dem, "rasterio", None)
        s = DemSet.from_dir(tmp_path)
        assert not s and s.elevation(36.45, 127.05) is None
        assert "rasterio" in s.skipped[0] and s.skipped[0].startswith("a.tif")

    def test_evaluator_falls_back_to_the_approximation_without_rasterio(self, tmp_path, monkeypatch):
        write_geographic(tmp_path / "a.tif", lon0=127.30, lat_top=36.40, fn=constant(77.7))
        before = estimate_elevation_m(127.35, 36.35)
        monkeypatch.setattr(dem, "rasterio", None)
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        assert estimate_elevation_m(127.35, 36.35) == before != 77.7

    def test_unreadable_dem_files_are_logged_once_when_the_default_set_loads(self, tmp_path, monkeypatch, caplog):
        (tmp_path / "broken.tif").write_text("not a tiff")
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        with caplog.at_level("WARNING", logger=dem.logger.name):
            dem.get_dem_set()
            dem.get_dem_set()
        warnings = [r for r in caplog.records if "DEM 파일" in r.getMessage()]
        assert len(warnings) == 1 and "broken.tif" in warnings[0].getMessage()

    def test_server_modules_import_in_a_process_where_rasterio_is_not_installed(self, tmp_path):
        """실제로 rasterio 를 막은 별도 프로세스에서 서버 모듈이 불러와지고 고도 조회가 근사값으로 동작하는지."""
        import subprocess
        import sys
        backend = Path(__file__).resolve().parents[1]
        write_geographic(tmp_path / "a.tif", fn=constant(77.7))
        code = (
            "import sys; sys.modules['rasterio'] = None\n"
            "from services import dem\n"
            "from agent.surface_slope_evaluator import estimate_elevation_m, calculate_segment_slope_percent\n"
            "print('rasterio_off', dem.rasterio is None)\n"
            "print('dem_empty', not dem.get_dem_set())\n"
            "print('elevation_is_approx', estimate_elevation_m(127.05, 36.45) != 77.7)\n"
            "print('slope_ok', calculate_segment_slope_percent([127.05, 36.45], [127.051, 36.451]) >= 0)\n"
        )
        env = {**os.environ, "PYTHONPATH": str(backend), dem.ENV_DEM_DIR: str(tmp_path)}
        result = subprocess.run([sys.executable, "-c", code], cwd=backend, env=env, capture_output=True,
                                text=True, timeout=120)
        assert result.returncode == 0, result.stderr[-800:]
        assert result.stdout.split() == ["rasterio_off", "True", "dem_empty", "True",
                                         "elevation_is_approx", "True", "slope_ok", "True"]


class TestSlopeBaseline:
    """짧은 구간은 중심에서 양쪽으로 늘려(최소 150m) 경사를 구한다 (DEM 칸·건물·나무 잡음 완화)."""

    RES, LON0, LAT_TOP = 0.0003, 127.30, 36.40  # 칸 약 25m x 33m
    LON_C = LON0 + 100.5 * RES                  # 가운데 칸의 중심
    LAT_C = LAT_TOP - 100.5 * RES

    def use_dem(self, tmp_path, monkeypatch, fn, **kwargs):
        write_geographic(tmp_path / "a.tif", res=self.RES, size=200, lon0=self.LON0, lat_top=self.LAT_TOP,
                         fn=fn, **kwargs)
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))

    def bump(self):
        """평지(50m) 한가운데 한 칸만 12m 솟은 지형 (나무·건물 잡음을 흉내)."""
        return lambda lon, lat: 50.0 + 12.0 * ((np.abs(lon - self.LON_C) < 1e-9) & (np.abs(lat - self.LAT_C) < 1e-9))

    def test_default_baseline_is_150_meters(self):
        assert MIN_SLOPE_BASELINE_M == 150.0

    def test_uniform_gradient_is_the_same_for_any_segment_length(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, lambda lon, lat: 100.0 + 11119.5 * (lat - 36.30))  # 북쪽 10%
        for dlat in (0.00022, 0.0009, 0.0036):  # 약 24m, 100m, 400m
            slope = calculate_segment_slope_percent([127.35, 36.35], [127.35, 36.35 + dlat])
            assert slope == pytest.approx(10.0, abs=0.3), dlat

    def test_a_single_noisy_cell_is_averaged_out_on_short_segments(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, self.bump())
        a, b = [self.LON_C, self.LAT_C], [self.LON_C + self.RES, self.LAT_C]  # 솟은 칸 중심 -> 옆 칸 중심 (약 25m)
        assert calculate_segment_slope_percent(a, b, min_baseline_m=0) >= 15.0   # 구간 그대로면 잡음이 그대로 들어간다
        assert calculate_segment_slope_percent(a, b) < 8.0                       # 150m 로 늘리면 평지로 보인다

    def test_long_segments_are_not_stretched(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, lambda lon, lat: 100.0 + 3000.0 * (lon - 127.30) + 700.0 * (lat - 36.30))
        a, b = [127.31, 36.33], [127.34, 36.35]  # 수 km
        assert calculate_segment_slope_percent(a, b) == calculate_segment_slope_percent(a, b, min_baseline_m=0)

    def test_slope_does_not_depend_on_the_travel_direction(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, lambda lon, lat: 100.0 + 3000.0 * (lon - 127.30) + 700.0 * (lat - 36.30))
        a, b = [127.33, 36.34], [127.3305, 36.3402]
        assert calculate_segment_slope_percent(a, b) == calculate_segment_slope_percent(b, a)

    def test_zero_length_segment_has_zero_slope(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, self.bump())
        assert calculate_segment_slope_percent([self.LON_C, self.LAT_C], [self.LON_C, self.LAT_C]) == 0.0

    def test_segment_crossing_the_dem_edge_never_mixes_real_and_approximate_elevation(self, tmp_path, monkeypatch):
        """한 점만 DEM 범위 안이어도 실제 값(500m)과 근사값(수십 m)을 비교하지 않는다."""
        write_geographic(tmp_path / "a.tif", res=0.001, size=50, lon0=127.30, lat_top=36.40, fn=constant(500.0))
        a, b = [127.349, 36.37], [127.352, 36.37]  # a 는 DEM 안, b 는 밖 (약 270m)
        without_dem = calculate_segment_slope_percent(a, b)
        monkeypatch.setenv(dem.ENV_DEM_DIR, str(tmp_path))
        dem.reset_default_dem()
        assert calculate_segment_slope_percent(a, b) == without_dem
        assert calculate_segment_slope_percent([127.31, 36.37], [127.312, 36.37]) == 0.0  # 둘 다 안: 평지

    def test_route_metrics_use_the_same_baseline(self, tmp_path, monkeypatch):
        self.use_dem(tmp_path, monkeypatch, self.bump())
        route = [[self.LON_C + i * self.RES, self.LAT_C] for i in range(-3, 4)]  # 25m 간격, 가운데가 솟은 칸
        raw = max(calculate_segment_slope_percent(route[i], route[i + 1], min_baseline_m=0) for i in range(6))
        metrics = evaluate_route_metrics(route)
        assert raw >= 15.0 and metrics["max_slope_percent"] < 8.0


class TestBundledDem:
    """저장소에 포함된 파일럿 지역 Copernicus 파일 (CI 에서도 실행된다)."""
    SITES = {"유림공원주차장": (36.36038, 127.35517), "송강동(GS마트앞)": (36.43442, 127.38650),
             "도안제2공한지": (36.32411, 127.34749), "어진동(C47)": (36.49734, 127.26746)}

    @pytest.fixture
    def bundled(self, monkeypatch):
        monkeypatch.setenv(dem.ENV_DEM_DIR, "data/dem")
        return dem.get_dem_set()

    def test_relative_dem_dir_is_resolved_from_the_backend_folder(self, monkeypatch, tmp_path):
        monkeypatch.chdir(tmp_path)  # 서버를 어느 폴더에서 실행해도 같은 파일을 찾는다
        assert dem.resolve_dem_dir("data/dem") == dem.BUNDLED_DEM_DIR
        assert dem.resolve_dem_dir(str(tmp_path)) == tmp_path
        assert dem.resolve_dem_dir("") is None and dem.resolve_dem_dir("  ") is None

    def test_bundled_file_is_readable_and_is_the_only_raster(self, bundled):
        assert bundled and bundled.skipped == []
        assert [r.path.name for r in bundled.rasters] == ["copernicus_glo30_daejeon_sejong.tif"]
        assert bundled.rasters[0].resolution_m <= 31.0

    def test_pilot_sites_have_plausible_elevations(self, bundled):
        for name, (lat, lon) in self.SITES.items():
            assert 20.0 <= bundled.elevation(lat, lon) <= 70.0, name

    def test_points_outside_the_pilot_area_fall_back_to_the_approximation(self, bundled):
        assert bundled.elevation(37.5665, 126.9780) is None  # 서울시청

    def test_dem_stays_off_by_default(self):
        assert not dem.get_dem_set()  # DEM_DIR 이 비어 있으면 저장소 파일이 있어도 쓰지 않는다

    def test_required_copernicus_notices_are_next_to_the_data(self):
        notice = (dem.BUNDLED_DEM_DIR / "NOTICE.md").read_text(encoding="utf-8")
        for required in (
            "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS "
            "by the European Union and ESA; all rights reserved",
            "produced using Copernicus WorldDEM-30",
            "do not incur any liability for any use of the Copernicus WorldDEM-30",
        ):
            assert required in notice


@pytest.mark.skipif(not REAL_DEM_DIR or not Path(REAL_DEM_DIR).is_dir(),
                    reason="로컬 전용: REAL_DEM_DIR=실제 DEM 폴더 를 주면 실행한다")
class TestRealDem:
    SITES = {"유림공원주차장": (36.36038, 127.35517), "송강동(GS마트앞)": (36.43442, 127.38650),
             "도안제2공한지": (36.32411, 127.34749), "어진동(C47)": (36.49734, 127.26746)}

    @pytest.fixture
    def real(self, monkeypatch):
        monkeypatch.setenv(dem.ENV_DEM_DIR, REAL_DEM_DIR)
        return dem.get_dem_set()

    def test_all_files_are_readable(self, real):
        assert real and real.skipped == []

    def test_finest_raster_wins_inside_the_pilot_area(self, real):
        sample = real.lookup(*self.SITES["유림공원주차장"])
        assert sample.resolution_m <= 40 and 30.0 <= sample.elevation_m <= 60.0

    def test_pilot_sites_have_plausible_elevations(self, real):
        for name, (lat, lon) in self.SITES.items():
            assert 20.0 <= real.elevation(lat, lon) <= 70.0, name

    def test_point_outside_all_files_is_none(self, real):
        assert real.elevation(37.5665, 126.9780) is None  # 서울시청

    def test_independent_sources_agree_within_a_few_meters(self, real):
        """같은 지점을 촘촘한 자료와 거친 자료로 읽어 비교 (서로 다른 출처의 교차 검증)."""
        fine, coarse = real.rasters[0], real.rasters[-1]
        if fine.resolution_m == coarse.resolution_m:
            pytest.skip("해상도가 다른 파일이 둘 이상 있어야 한다")
        for name, (lat, lon) in self.SITES.items():
            a, b = fine.elevation(lat, lon), coarse.elevation(lat, lon)
            assert a is not None and b is not None and abs(a - b) <= 6.0, name
