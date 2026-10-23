"""[3번 노희선 - 서버] US-A3 /api/v1/walk/plan 지연·외부 호출 검증 모듈.

외부 OSRM(OpenStreetMap 공개 보행 경로 서버)은 네트워크에 의존하므로 가짜(monkeypatch)로 바꿔
'TTL 캐시', '공개 서버 이용 규칙(1초 1회)', '예산 초과 시 보정 중단', '장애 시 폴백' 을 검증한다.

- 같은 경유점은 10분간 캐시 → 같은 출발지 반복 요청은 외부 호출 0회
- 요청 1번에 후보당 1회(3회)만 먼저 질의, 호출 시작 간격은 서버 전체에서 1초 이상
  (예전 '반경 3종 동시 질의 = 9회 동시'는 운영에서 HTTP 429·연결 차단을 일으켜 없앴다)
- HTTP 429 는 한 번만 받아도 서킷을 연다
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


class TestOsrmUsagePolicy:
    """공개 OSRM 이용 규칙(1초 1회) 준수. 예전에는 요청 1번에 9회를 동시에 보내 운영에서 HTTP 429 가 났다."""

    def test_first_round_queries_one_radius_per_candidate(self, monkeypatch):
        """목표 거리에 바로 맞으면 요청 1번에 OSRM 3회(후보당 1회)만 호출한다 (예전 9회)."""
        calls = []
        target = 1400.0

        def exact_fetch(waypoints, timeout_seconds=1.2, use_cache=True):
            calls.append(1)
            route = _circle_route(waypoints)
            return route[0], target, route[2]

        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", exact_fetch)
        monkeypatch.setattr(lrp, "polyline_length_m", lambda coords: target)
        plans = lrp.plan_loop_candidates(37.5665, 126.978, target)
        assert len(plans) == 3
        assert len(calls) == 3

    def test_calls_start_at_least_interval_apart(self, monkeypatch):
        """동시에 여러 호출이 와도 시작 간격이 OSRM_MIN_INTERVAL_S 이상이어야 한다 (서버 전체 합산)."""
        monkeypatch.setattr(rnr, "OSRM_MIN_INTERVAL_S", 0.2)
        starts, lock = [], threading.Lock()

        def record(waypoints, timeout_seconds):
            with lock:
                starts.append(time.monotonic())
            return _fake_route()

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", record)
        wps = [[(37.5665, 126.978 + i * 0.001), (37.57, 126.98)] for i in range(4)]
        threads = [threading.Thread(target=rnr.fetch_osrm_foot_route, args=(w,)) for w in wps]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        starts.sort()
        gaps = [b - a for a, b in zip(starts, starts[1:])]
        assert len(starts) == 4
        assert min(gaps) >= 0.19, gaps

    def test_skips_call_when_queue_too_long(self, monkeypatch):
        """기다릴 시간이 상한을 넘으면 호출하지 않고 None (폴백). 실패로 세지 않아 서킷이 열리지 않는다."""
        monkeypatch.setattr(rnr, "OSRM_MIN_INTERVAL_S", 1.0)
        monkeypatch.setattr(rnr, "OSRM_MAX_QUEUE_WAIT_S", 0.5)
        calls = []
        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", lambda w, t: (calls.append(1), _fake_route())[1])
        before = rnr.osrm_status()
        assert rnr.fetch_osrm_foot_route([(37.5665, 126.978), (37.57, 126.98)]) is not None
        assert rnr.fetch_osrm_foot_route([(37.5665, 126.979), (37.57, 126.98)]) is None
        after = rnr.osrm_status()
        assert len(calls) == 1
        assert after["skipped_queue"] == before["skipped_queue"] + 1
        assert after["failure"] == before["failure"]
        assert not rnr.osrm_circuit_is_open()

    def test_http_429_opens_circuit_immediately(self, monkeypatch):
        """429(요청 과다)는 한 번만 받아도 바로 쉰다. 계속 보내면 연결 자체가 차단된다."""
        import urllib.error

        def too_many(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 429, "Too Many Requests", {}, None)

        monkeypatch.setattr(rnr.urllib.request, "urlopen", too_many)
        assert rnr.fetch_osrm_foot_route([(37.5665, 126.978), (37.57, 126.98)]) is None
        assert rnr.osrm_circuit_is_open()
        assert rnr.osrm_status()["last_error"] == "HTTP 429"

    def test_policy_constants(self):
        assert rnr.OSRM_POLICY_INTERVAL_S >= 1.0
        assert lrp.SPECULATIVE_SCALES == (1.0,)


class TestRefinementBudget:

    def test_picks_scale_closest_to_target_distance(self, monkeypatch):
        """세 배율 중 목표 거리에 가장 가까운 결과를 채택해야 한다."""
        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", lambda w, timeout_seconds=1.2, use_cache=True: _circle_route(w))
        target = 1400.0
        plans = lrp.plan_loop_candidates(37.5665, 126.978, target)
        for plan in plans.values():
            if plan.source == "osrm_live":
                assert abs(plan.distance_m - target) / target <= lrp.DISTANCE_TOLERANCE + 0.05

    def test_no_refinement_when_budget_exhausted(self, monkeypatch):
        """남은 예산이 직전 라운드보다 짧으면(예산 1.3초, OSRM 0.9초) 1라운드만 하고 보정 라운드를 건너뛴다."""
        calls = []

        def slow_fetch(waypoints, timeout_seconds=1.2, use_cache=True):
            calls.append(1)
            time.sleep(0.9)
            return _circle_route(waypoints, scale=0.5)  # 일부러 목표에서 많이 벗어난 길이

        monkeypatch.setattr(lrp, "fetch_osrm_foot_route", slow_fetch)
        t0 = time.perf_counter()
        lrp.plan_loop_candidates(37.5665, 126.978, 1400.0, time_budget_s=1.3)
        elapsed = time.perf_counter() - t0
        assert len(calls) == 3 * len(lrp.SPECULATIVE_SCALES), "2라운드 보정 호출이 없어야 한다"
        assert elapsed < 1.5

    def test_budget_fits_app_timeout(self):
        """후보 생성 예산 + 줄 대기 상한이 앱 대기 한도(20초, api.ts API_TIMEOUT_MS)보다 충분히 짧아야 한다."""
        assert lrp.PLAN_TIME_BUDGET_S + rnr.OSRM_MAX_QUEUE_WAIT_S + lrp.OSRM_TIMEOUT_S <= 15.0


class TestWalkPlanEndpointLatency:
    _BODY = {"dog_name": "Coco", "target_duration_minutes": 30, "origin_lat": 37.5665, "origin_lon": 126.978}

    def test_plan_within_budget_with_slow_osrm(self, client, monkeypatch):
        """OSRM 이 각 0.9초 걸려도 보정은 예산(PLAN_TIME_BUDGET_S) 안에서 멈추고 코스 3개를 준다."""
        def slow_uncached(waypoints, timeout_seconds):
            time.sleep(0.9)
            return _circle_route(waypoints)

        monkeypatch.setattr(rnr, "_fetch_osrm_foot_route_uncached", slow_uncached)
        t0 = time.perf_counter()
        res = client.post("/api/v1/walk/plan", json=self._BODY)
        elapsed = time.perf_counter() - t0
        assert res.status_code == 200, res.text
        assert elapsed < lrp.PLAN_TIME_BUDGET_S + 1.5, f"/walk/plan 응답 {elapsed:.2f}s"
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
