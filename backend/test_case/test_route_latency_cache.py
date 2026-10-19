"""[이슈 #125] 코스 생성 속도 — 같은 계산을 반복하지 않는다.

운영 서버(느린 CPU)에서 공원 모드 코스 요청이 평균 6초(앱 대기 3.5초)였다. 원인은
1) 요청 하나에서 공원 보행망 그래프를 9번 다시 만들고
2) 구간 경사를 위해 같은 좌표의 고도를 DEM 파일에서 수천 번 다시 읽는 것이었다.
결과는 입력이 같으면 항상 같으므로 기억해 두고 재사용한다. (결과 값은 달라지면 안 된다)
"""

import threading

import pytest
from fastapi.testclient import TestClient
from shapely.geometry import Polygon

import agent.park_route_validation as prv
import agent.pilot_park_routes as ppr
from agent.park_walk_planner import plan_park_walk
from services import dem, route_warmup


# ---- 1) 공원 그래프 재사용 ----

def test_park_graph_is_built_once_and_reused():
    first = prv.build_park_graph("doan")
    assert prv.build_park_graph("doan") is first


def test_park_graph_cache_follows_boundary_data(monkeypatch):
    """경계 데이터가 바뀌면(예: 테스트에서 교체) 예전 그래프를 돌려주지 않는다."""
    assert prv.build_park_graph("songgang").number_of_edges() > 0
    far_box = Polygon([(127.5, 36.5), (127.51, 36.5), (127.51, 36.51), (127.5, 36.51)])
    monkeypatch.setattr(ppr, "_PARK_POLYGONS_CACHE", {"songgang": far_box})
    with pytest.raises(prv.RoutePlanningError):
        prv.build_park_graph("songgang")  # 경계 밖이라 연결 가능한 보행로가 없다


def test_second_plan_does_not_rebuild_graph(monkeypatch):
    lat, lon, _ = ppr.PILOT_PARK_CENTERS["doan"]
    plan_park_walk("doan", lat, lon, 1400.0, 1)  # 첫 계산으로 그래프를 채운다
    built = []
    original = prv._add_way_to_graph
    monkeypatch.setattr(prv, "_add_way_to_graph", lambda *a, **k: (built.append(1), original(*a, **k))[1])
    plan_park_walk("doan", lat, lon, 1400.0, 1)
    prv.validate_park_route(plan_park_walk("doan", lat, lon, 1400.0, 1), "doan", 2.8, 30.0)
    assert built == []


def test_cached_graph_gives_same_plan_every_time():
    lat, lon, _ = ppr.PILOT_PARK_CENTERS["yurim"]
    a = plan_park_walk("yurim", lat, lon, 1400.0, 1)
    b = plan_park_walk("yurim", lat, lon, 1400.0, 1)
    assert a == b


# ---- 2) 고도 조회 결과 기억 ----

class _CountingRaster:
    resolution_m = 30.0

    class path:  # noqa: N801 - DemSet 이 raster.path.name 을 읽는다
        name = "fake.tif"

    def __init__(self, inside=True):
        self.calls = 0
        self.inside = inside

    def elevation(self, lat, lon):
        self.calls += 1
        return (lat + lon) if self.inside else None

    def close(self):
        pass


def test_same_point_is_read_from_file_only_once():
    raster = _CountingRaster()
    dem_set = dem.DemSet([raster])
    assert dem_set.elevation(36.1, 127.2) == pytest.approx(163.3)
    assert dem_set.elevation(36.1, 127.2) == pytest.approx(163.3)
    assert raster.calls == 1
    dem_set.elevation(36.2, 127.2)
    assert raster.calls == 2


def test_outside_range_none_is_also_remembered():
    raster = _CountingRaster(inside=False)
    dem_set = dem.DemSet([raster])
    assert dem_set.elevation(10.0, 10.0) is None
    assert dem_set.elevation(10.0, 10.0) is None
    assert raster.calls == 1


@pytest.mark.parametrize("bad", [(float("nan"), 1.0), ("a", 1.0), ([1], 2.0), (None, 1.0)])
def test_invalid_input_still_raises_and_is_not_remembered(bad):
    dem_set = dem.DemSet([_CountingRaster()])
    for _ in range(2):
        with pytest.raises(ValueError):
            dem_set.elevation(*bad)


def test_elevation_cache_stays_bounded(monkeypatch):
    monkeypatch.setattr(dem, "ELEVATION_CACHE_MAX", 5)
    raster = _CountingRaster()
    dem_set = dem.DemSet([raster])
    for i in range(30):
        dem_set.elevation(30.0 + i * 0.001, 127.0)
    assert len(dem_set._elevation_cache) <= 5
    assert dem_set.elevation(30.0, 127.0) == pytest.approx(157.0)  # 비운 뒤에도 값은 맞다


def test_new_dem_set_starts_with_empty_cache():
    """DEM 설정이 바뀌어 새 묶음이 만들어지면 예전 값이 따라오지 않는다."""
    r1 = _CountingRaster()
    dem.DemSet([r1]).elevation(1.0, 2.0)
    r2 = _CountingRaster()
    dem.DemSet([r2]).elevation(1.0, 2.0)
    assert r2.calls == 1


# ---- 3) 서버가 켜질 때 미리 계산 ----

def test_warmup_visits_every_graph_edge_and_survives_failures(monkeypatch):
    class _G:
        edges = [((1, 2), (3, 4)), ((3, 4), (5, 6))]

    visited = []

    def fake_slope(a, b):
        visited.append((a, b))
        if len(visited) == 1:
            raise RuntimeError("DEM 읽기 실패")  # 한 구간 실패해도 계속한다
        return 1.0

    monkeypatch.setattr("agent.park_route_validation.build_park_graph", lambda pid: _G())
    monkeypatch.setattr("agent.surface_slope_evaluator.calculate_segment_slope_percent", fake_slope)
    summary = route_warmup.warm_park_caches(["doan"])
    assert visited == _G.edges
    assert summary["doan"] == {"edges": 2, "failed": 1}


def test_warmup_reports_graph_failure_without_raising(monkeypatch):
    def boom(pid):
        raise prv.RoutePlanningError("WALK_NETWORK_UNAVAILABLE", "없음")

    monkeypatch.setattr("agent.park_route_validation.build_park_graph", boom)
    summary = route_warmup.warm_park_caches(["doan"])
    assert summary["doan"]["error"] == "WALK_NETWORK_UNAVAILABLE"


def test_background_warmup_is_skipped_under_pytest_and_when_disabled(monkeypatch):
    assert route_warmup.start_background_warmup() is None  # pytest 실행 중에는 켜지 않는다
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.setenv("PETWALK_DISABLE_WARMUP", "1")
    assert route_warmup.start_background_warmup() is None


def test_background_warmup_starts_daemon_thread_when_enabled(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("PETWALK_DISABLE_WARMUP", raising=False)
    done = threading.Event()
    monkeypatch.setattr(route_warmup, "warm_park_caches", lambda *a, **k: done.set() or {})
    monkeypatch.setattr(route_warmup, "WARMUP_DELAY_S", 0.0)
    thread = route_warmup.start_background_warmup()
    assert thread is not None and thread.daemon
    assert done.wait(2.0)


# ---- 4) 날씨 미리 받기 / 주기 갱신 ----

def test_refresh_weather_once_calls_each_point_with_force_refresh_and_survives_errors():
    calls = []

    def fetch(lat, lon, force_refresh=False):
        calls.append((lat, lon, force_refresh))
        if len(calls) == 1:
            raise OSError("네트워크 실패")

    ok = route_warmup.refresh_weather_once(fetch, [(36.1, 127.1), (36.2, 127.2), (36.3, 127.3)])
    assert ok == 2
    assert calls == [(36.1, 127.1, True), (36.2, 127.2, True), (36.3, 127.3, True)]


def test_background_warmup_refreshes_weather_repeatedly_then_stops(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("PETWALK_DISABLE_WARMUP", raising=False)
    monkeypatch.setattr(route_warmup, "WARMUP_DELAY_S", 0.0)
    monkeypatch.setattr(route_warmup, "WEATHER_REFRESH_S", 0.05)
    monkeypatch.setattr(route_warmup, "warm_park_caches", lambda *a, **k: {})
    hits = []
    enough = threading.Event()

    def fetch(lat, lon, force_refresh=False):
        hits.append(force_refresh)
        if len(hits) >= 4:
            enough.set()

    thread = route_warmup.start_background_warmup(weather_fetch=fetch, weather_points=[(36.0, 127.0), (36.1, 127.1)])
    try:
        assert enough.wait(3.0)  # 2개 지점 × 2번 이상 갱신
        assert all(hits)
    finally:
        route_warmup.stop_background_warmup()
    thread.join(2.0)
    assert not thread.is_alive()


def test_heat_risk_cache_is_used_but_force_refresh_bypasses_it(monkeypatch):
    import main

    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    main.clear_heat_risk_cache()
    built = []
    monkeypatch.setattr(main, "build_heat_risk_response", lambda lat, lon: (built.append(1), {"n": len(built)})[1])
    try:
        assert main._live_heat_risk_response(36.5, 127.5) == {"n": 1}
        assert main._live_heat_risk_response(36.5, 127.5) == {"n": 1}  # 캐시
        assert main._live_heat_risk_response(36.5, 127.5, force_refresh=True) == {"n": 2}  # 새로 받음
        assert main._live_heat_risk_response(36.5, 127.5) == {"n": 2}  # 새 값이 캐시됨
    finally:
        main.clear_heat_risk_cache()


# ---- 5) 서버 시작 단계 (pytest 는 이 단계를 건너뛰므로 직접 호출해 검사한다) ----

def test_startup_hook_passes_all_park_centers_to_warmup(monkeypatch):
    import main

    seen = {}
    monkeypatch.setattr(main, "start_background_warmup", lambda **kw: seen.update(kw))
    main._warm_up_route_caches()  # NameError 같은 시작 오류가 없어야 한다
    assert seen["weather_fetch"] is main._live_heat_risk_response
    assert len(seen["weather_points"]) == len(ppr.PILOT_PARK_CENTERS) == 4
    assert all(isinstance(lat, float) and isinstance(lon, float) for lat, lon in seen["weather_points"])


def test_server_starts_and_health_responds_with_startup_event():
    """with TestClient(app) 는 실제 서버처럼 startup 이벤트를 실행한다. (pytest 중에는 워밍업만 건너뛴다)"""
    import main
    from fastapi.testclient import TestClient

    with TestClient(main.app) as c:
        assert c.get("/health").json()["status"] == "ok"


# ---- 6) 날씨 미리 받기는 "최근 요청이 있을 때만" (기상청·에어코리아 호출 한도 보호) ----

def test_weather_prefetch_is_skipped_when_nobody_used_the_server(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST", raising=False)
    monkeypatch.delenv("PETWALK_DISABLE_WARMUP", raising=False)
    monkeypatch.setattr(route_warmup, "WARMUP_DELAY_S", 0.0)
    monkeypatch.setattr(route_warmup, "WEATHER_REFRESH_S", 0.05)
    monkeypatch.setattr(route_warmup, "warm_park_caches", lambda *a, **k: {})
    monkeypatch.setattr(route_warmup, "ACTIVE_WINDOW_S", 0.0)  # 항상 "최근 요청 없음"
    calls = []
    thread = route_warmup.start_background_warmup(weather_fetch=lambda *a, **k: calls.append(1), weather_points=[(36.0, 127.0)])
    try:
        import time as _t
        _t.sleep(0.5)  # 여러 번 돌 시간
        assert calls == []
    finally:
        route_warmup.stop_background_warmup()
    thread.join(2.0)


def test_recent_request_makes_prefetch_run_again(monkeypatch):
    monkeypatch.setattr(route_warmup, "ACTIVE_WINDOW_S", 60.0)
    route_warmup.mark_activity()
    assert route_warmup._recently_active() is True
    monkeypatch.setattr(route_warmup, "_LAST_ACTIVITY", route_warmup._LAST_ACTIVITY - 120.0)
    assert route_warmup._recently_active() is False


def test_user_requests_mark_activity_but_health_checks_do_not(monkeypatch):
    import main

    monkeypatch.setattr(route_warmup, "_LAST_ACTIVITY", 0.0)
    assert TestClient(main.app).get("/health").status_code == 200
    assert route_warmup._LAST_ACTIVITY == 0.0  # 헬스체크(서버를 깨우는 용도)는 활동으로 치지 않는다
    TestClient(main.app).get("/api/v1/hazards", params={"lat": 36.36, "lon": 127.36, "radius_m": 500})
    assert route_warmup._LAST_ACTIVITY > 0.0
