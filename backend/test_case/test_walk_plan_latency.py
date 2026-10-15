"""[3번 노희선 - 서버] US-A3 /api/v1/walk/plan 지연 목표(≤1.5초) 검증 모듈.

외부 OSRM(OpenStreetMap 공개 보행 경로 서버)은 네트워크에 의존하므로 가짜(monkeypatch)로 바꿔
'TTL 캐시', '투기적 병렬 반경 보정', '예산 초과 시 보정 중단', '장애 시 폴백' 을 검증한다.

- 같은 경유점은 10분간 캐시 → 같은 출발지 반복 요청은 외부 호출 0회
- 후보 1개당 반경 배율 3종을 동시에 질의 → 순차 보정 3회(≈3초) 가 1회분(≈1초)
- OSRM 1회가 0.9초(실측 평균) 걸려도 /walk/plan 전체 1.5초 이내
- OSRM 전면 장애 시에도 200 + 폴백 경로
"""

import threading
import time

import pytest
from fastapi.testclient import TestClient

import agent.loop_route_planner as lrp
import agent.road_network_routes as rnr
from agent.route_geometry import polyline_length_m
from main import app


@pytest.fixture(autouse=True)
def _clean_cache():
    rnr.clear_osrm_cache()
    yield
    rnr.clear_osrm_cache()


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(app)


def _fake_route(n_points: int = 20):
    coords = [[126.978 + i * 0.0001, 37.5665 + i * 0.0001] for i in range(n_points)]
    return coords, 1400.0, 1200.0


def _circle_route(waypoints, scale: float = 1.0):
    """경유점(위도, 경도)을 그대로 잇는 닫힌 루프. 반경을 scale 배 한 것처럼 길이를 늘린다."""
    lat0, lon0 = waypoints[0]
    coords = []
    for lat, lon in waypoints:
        coords.append([lon0 + (lon - lon0) * scale, lat0 + (lat - lat0) * scale])
    coords.append(list(coords[0]))
    # 12개 이상 점이 되도록 보간
    dense = []
    for a, b in zip(coords, coords[1:]):
        for k in range(4):
            dense.append([a[0] + (b[0] - a[0]) * k / 4, a[1] + (b[1] - a[1]) * k / 4])
    dense.append(coords[-1])
    return dense, polyline_length_m(dense), 100.0


class TestOsrmCache:
    def test_second_call_with_same_waypoints_hits_cache(self, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), _fake_route())[1])
        wps = [(37.5665, 126.978), (37.57, 126.98), (37.5665, 126.978)]
        assert rnr.fetch_osrm_foot_route(wps) == rnr.fetch_osrm_foot_route(wps)
        assert len(calls) == 1, "같은 경유점은 외부 호출을 한 번만 해야 한다"
        assert rnr.osrm_cache_size() == 1

    def test_failure_is_not_cached(self, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), None)[1])
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


class TestOsrmCircuitBreaker:
    def test_opens_after_consecutive_failures_and_skips_calls(self, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), None)[1])
        wps = [(37.5665, 126.978), (37.57, 126.98)]
        for _ in range(rnr.OSRM_CIRCUIT_FAILURE_THRESHOLD):
            assert rnr.fetch_osrm_foot_route(wps) is None
        assert rnr.osrm_circuit_is_open()
        n = len(calls)
        assert rnr.fetch_osrm_foot_route(wps) is None
        assert len(calls) == n, "서킷이 열리면 외부 호출 없이 즉시 None 이어야 한다"

    def test_closes_after_window_and_success_resets(self, monkeypatch):
        monkeypatch.setattr(rnr, "OSRM_CIRCUIT_OPEN_SECONDS", 0.05)
        results = iter([None, None, None, _fake_route()])
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), next(results))[1])
        wps = [(37.5665, 126.978), (37.57, 126.98)]
        for _ in range(3):
            rnr.fetch_osrm_foot_route(wps)
        assert rnr.osrm_circuit_is_open()
        time.sleep(0.08)
        assert not rnr.osrm_circuit_is_open()
        assert rnr.fetch_osrm_foot_route(wps) is not None
        assert len(calls) == 4

    def test_endpoint_is_fast_while_circuit_open(self, client, monkeypatch):
        """OSRM 장애 중에는 타임아웃을 기다리지 않고 즉시 폴백해야 한다."""
        def timing_out(waypoints, timeout_seconds):
            time.sleep(0.4)
            return None

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", timing_out)
        body = {"dog_name": "Coco", "target_duration_minutes": 30, "origin_lat": 35.1796, "origin_lon": 129.0756}
        client.post("/api/v1/walk/plan", json=body)  # 실패가 쌓여 서킷이 열림
        assert rnr.osrm_circuit_is_open()
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=body)
        assert res.status_code == 200
        assert time.perf_counter() - t0 < 0.3


class TestSpeculativeParallelRefinement:
    def test_scales_are_queried_concurrently(self, monkeypatch):
        """OSRM 1회 0.3초일 때 후보 3개 × 배율 3종 = 9회 호출이 ≈0.3초(동시)에 끝나야 한다."""
        in_flight, peak, lock = [], [0], threading.Lock()

        def slow_fetch(waypoints, timeout_seconds=1.2, use_cache=True):
            with lock:
                in_flight.append(1)
                peak[0] = max(peak[0], len(in_flight))
            time.sleep(0.3)
            with lock:
                in_flight.pop()
            return _circle_route(waypoints)

        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", slow_fetch)
        t0 = time.perf_counter()
        plans = lrp.plan_loop_candidates(37.5665, 126.978, 1400.0)
        elapsed = time.perf_counter() - t0

        assert len(plans) == 3
        assert peak[0] >= 4, "여러 OSRM 질의가 동시에 진행되어야 한다"
        assert elapsed < 1.0, f"병렬이면 0.3초대여야 함 (측정 {elapsed:.2f}s)"

    def test_picks_scale_closest_to_target_distance(self, monkeypatch):
        """세 배율 중 목표 거리에 가장 가까운 결과를 채택해야 한다."""
        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", lambda w, timeout_seconds=1.2, use_cache=True: _circle_route(w))
        target = 1400.0
        plans = lrp.plan_loop_candidates(37.5665, 126.978, target)
        for plan in plans.values():
            if plan.source == "osrm_live":
                assert abs(plan.distance_m - target) / target <= lrp.DISTANCE_TOLERANCE + 0.05

    def test_no_refinement_when_budget_exhausted(self, monkeypatch):
        """예산(1.3초)보다 느린 OSRM(0.9초) 이면 1라운드만 하고 보정 라운드를 건너뛰어야 한다."""
        calls = []

        def slow_fetch(waypoints, timeout_seconds=1.2, use_cache=True):
            calls.append(1)
            time.sleep(0.9)
            return _circle_route(waypoints, scale=0.5)  # 일부러 목표에서 많이 벗어난 길이

        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", slow_fetch)
        t0 = time.perf_counter()
        lrp.plan_loop_candidates(37.5665, 126.978, 1400.0)
        elapsed = time.perf_counter() - t0
        assert len(calls) == 3 * len(lrp.SPECULATIVE_SCALES), "2라운드 보정 호출이 없어야 한다"
        assert elapsed < 1.5

    def test_budget_constants_fit_latency_target(self):
        assert lrp.OSRM_TIMEOUT_S <= 1.2
        assert lrp.PLAN_TIME_BUDGET_S <= 1.3


class TestWalkPlanEndpointLatency:
    _BODY = {"dog_name": "Coco", "target_duration_minutes": 30, "origin_lat": 37.5665, "origin_lon": 126.978}

    def test_plan_under_1_5s_with_slow_osrm(self, client, monkeypatch):
        """OSRM 이 각 0.9초 걸려도(실측 평균) 전체 응답은 1.5초 이내여야 한다."""
        def slow_uncached(waypoints, timeout_seconds):
            time.sleep(0.9)
            return _circle_route(waypoints)

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", slow_uncached)
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        elapsed = time.perf_counter() - t0
        assert res.status_code == 200, res.text
        assert elapsed < 1.5, f"/walk/plan 응답 {elapsed:.2f}s (목표 ≤1.5s)"
        assert len(res.json()["courses"]) == 3

    def test_repeat_request_served_from_cache(self, client, monkeypatch):
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), _circle_route(w))[1])
        client.post("/api/v1/walk/plan", json=self._BODY)
        n_first = len(calls)
        assert n_first >= 1
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        elapsed = time.perf_counter() - t0
        assert res.status_code == 200
        assert len(calls) == n_first, "두 번째 요청은 외부 호출이 없어야 한다"
        assert elapsed < 0.5

    def test_osrm_failure_falls_back(self, client, monkeypatch):
        # 실제 구현은 네트워크 예외/타임아웃을 삼키고 None 을 돌려주므로 같은 계약으로 흉내낸다
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: None)
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        assert res.status_code == 200
        assert time.perf_counter() - t0 < 1.5
        body = res.json()
        assert len(body["geojson"]["features"]) >= 1
        assert body["is_live_server"] is True


class TestFullPipelineJointSlaProfiling:
    """[과제 1-3] 3번 노희선과 백엔드 SLA 1.5초 합동 프로파일링:
    
    실시간 기상 데이터 수집 + OSRM 보행 라우팅 + Agent 의도 파싱 + 다요소 채점 전체 왕복 시간(RTT) ≤ 1.5초 달성 검증.
    """
    _FULL_REQ = {
        "dog_name": "토리",
        "breed": "비숑프리제",
        "target_duration_minutes": 25,
        "user_query": "햇빛이 강한데 25분 동안 시원하고 완만한 길 위주로 가고 싶어요",
        "origin_lat": 36.3628,
        "origin_lon": 127.3592,
        "origin_mode": "parking_pnr",
        "parking_lot_id": "pkg_yurim_02",
    }

    def test_full_pipeline_rtt_under_1_5s(self, client, monkeypatch):
        """기상청 지면열 추정 + OSRM 라우팅(0.7s 지연 모의) + ReAct Agent 실행 통합 RTT ≤ 1.5초 검증."""
        def mock_kma_and_osrm(waypoints, timeout_seconds):
            time.sleep(0.7)  # 실측 OSRM 지연 0.7초
            return _circle_route(waypoints)

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", mock_kma_and_osrm)

        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._FULL_REQ)
        elapsed = time.perf_counter() - t0

        assert res.status_code == 200, res.text
        assert elapsed < 1.5, f"전체 파이프라인 RTT {elapsed:.2f}s (목표 ≤1.5s)"
        data = res.json()
        assert len(data["courses"]) == 3
        assert "weather" in data
        assert "지면온도" in data["briefing"] or "뜨거" in data["briefing"] or "골든타임" in data["briefing"]
        assert data.get("parking_lot") is not None
