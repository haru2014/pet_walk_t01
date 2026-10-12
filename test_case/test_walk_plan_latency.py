"""[3번 노희선 - 서버] US-A3 /api/v1/walk/plan 지연 목표(≤1.5초) 검증 모듈.

외부 OSRM(OpenStreetMap 공개 보행 경로 서버)은 네트워크에 의존하므로 여기서는 가짜(monkeypatch)로 바꿔
'병렬 호출', 'TTL 캐시', '타임아웃 시 고정 경로 폴백' 세 가지 동작을 검증한다.

- 순차 호출 3회(≈3초) → 병렬 1회분(≈1초)
- 같은 경유점은 10분간 캐시 → 반복 요청은 외부 호출 0회
- 외부 서버 실패/지연 시에도 200 + 고정 경로 반환
"""

import threading
import time

import pytest
from fastapi.testclient import TestClient

import agent.road_network_routes as rnr
import agent.walk_planning_agent as wpa
from main import app


@pytest.fixture(autouse=True)
def _clean_cache():
    rnr.clear_osrm_cache()
    yield
    rnr.clear_osrm_cache()


def _fake_route(n_points: int = 20):
    coords = [[126.978 + i * 0.0001, 37.5665 + i * 0.0001] for i in range(n_points)]
    return coords, 1400.0, 1200.0


class TestOsrmCache:
    def test_second_call_with_same_waypoints_hits_cache(self, monkeypatch):
        calls = []

        def fake_uncached(waypoints, timeout_seconds):
            calls.append(waypoints)
            return _fake_route()

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", fake_uncached)
        wps = [(37.5665, 126.978), (37.57, 126.98), (37.5665, 126.978)]

        first = rnr.fetch_osrm_foot_route(wps)
        second = rnr.fetch_osrm_foot_route(wps)

        assert first == second
        assert len(calls) == 1, "같은 경유점은 외부 호출을 한 번만 해야 한다"
        assert rnr.osrm_cache_size() == 1

    def test_failure_is_not_cached(self, monkeypatch):
        calls = []

        def fake_uncached(waypoints, timeout_seconds):
            calls.append(1)
            return None

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", fake_uncached)
        wps = [(37.5665, 126.978), (37.57, 126.98)]
        assert rnr.fetch_osrm_foot_route(wps) is None
        assert rnr.fetch_osrm_foot_route(wps) is None
        assert len(calls) == 2, "실패는 캐시하지 않고 다음 요청에서 재시도해야 한다"
        assert rnr.osrm_cache_size() == 0

    def test_expired_entry_is_refetched(self, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), _fake_route())[1])
        monkeypatch.setattr(rnr, "OSRM_CACHE_TTL_SECONDS", 0.05)
        wps = [(37.5665, 126.978), (37.57, 126.98)]
        rnr.fetch_osrm_foot_route(wps)
        time.sleep(0.08)
        rnr.fetch_osrm_foot_route(wps)
        assert len(calls) == 2


class TestParallelCandidates:
    def test_three_candidates_fetched_concurrently(self, monkeypatch):
        """각 OSRM 호출이 0.3초 걸릴 때 3후보 생성이 0.9초(순차)가 아닌 ≈0.3초(병렬)여야 한다."""
        in_flight = []
        peak = [0]
        lock = threading.Lock()

        def slow_fetch(waypoints, timeout_seconds=1.2, use_cache=True):
            with lock:
                in_flight.append(1)
                peak[0] = max(peak[0], len(in_flight))
            time.sleep(0.3)
            with lock:
                in_flight.pop()
            return _fake_route()

        monkeypatch.setattr(wpa, "fetch_osrm_foot_route", slow_fetch)

        t0 = time.perf_counter()
        candidates = wpa.mock_generate_loop_candidates(37.5665, 126.978, 1400.0, 30.0, True, 15.0, ["dirt"])
        elapsed = time.perf_counter() - t0

        assert len(candidates) == 3
        assert peak[0] >= 2, "OSRM 호출이 동시에 진행되어야 한다"
        assert elapsed < 0.75, f"병렬 처리라면 0.9초 미만이어야 함 (측정 {elapsed:.2f}s)"

    def test_default_timeout_fits_latency_budget(self):
        assert rnr.OSRM_DEFAULT_TIMEOUT_SECONDS <= 1.2


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


class TestWalkPlanEndpointLatency:
    _BODY = {"dog_name": "Coco", "target_duration_minutes": 30, "origin_lat": 37.5665, "origin_lon": 126.978}

    def test_plan_under_1_5s_with_slow_osrm(self, client, monkeypatch):
        """OSRM 이 각 0.9초 걸려도(실측 평균) 전체 응답은 1.5초 이내여야 한다."""
        def slow_uncached(waypoints, timeout_seconds):
            time.sleep(0.9)
            return _fake_route()

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", slow_uncached)
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        elapsed = time.perf_counter() - t0
        assert res.status_code == 200, res.text
        assert elapsed < 1.5, f"/walk/plan 응답 {elapsed:.2f}s (목표 ≤1.5s)"
        assert len(res.json()["courses"]) == 3

    def test_repeat_request_served_from_cache(self, client, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), _fake_route())[1])
        client.post("/api/v1/walk/plan", json=self._BODY)
        n_first = len(calls)
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        elapsed = time.perf_counter() - t0
        assert res.status_code == 200
        assert len(calls) == n_first, "두 번째 요청은 외부 호출이 없어야 한다"
        assert elapsed < 0.5

    def test_osrm_failure_falls_back_to_fixed_route(self, client, monkeypatch):
        # 실제 구현은 네트워크 예외/타임아웃을 삼키고 None 을 돌려주므로 같은 계약으로 흉내낸다
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: None)
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        assert res.status_code == 200
        body = res.json()
        assert len(body["geojson"]["features"]) >= 1
        assert body["is_live_server"] is True
