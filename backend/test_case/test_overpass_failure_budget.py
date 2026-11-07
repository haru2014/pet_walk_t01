"""Overpass 조회가 실패해도 한 요청 안에서 같은 지역을 반복해 받으며 시간을 쓰지 않는다.

예전에는 실패가 캐시되지 않아, 후보 3개의 큰길 검사·지표 계산이 각각 4초씩 다시 기다려
서버 응답이 앱 제한(20초)을 넘겼고 앱은 '현재 위치 주변 경로를 확인할 수 없습니다'를 띄웠다.
"""

import os
import threading
import time

import pytest

from agent import osm_overpass_client as client


@pytest.fixture(autouse=True)
def _enable_routing(monkeypatch):
    monkeypatch.setenv("OSM_GRAPH_ROUTING", "1")
    client.clear_region_cache()
    yield
    client.clear_region_cache()


def test_failed_download_is_not_repeated_within_failure_window(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "_download", lambda query, *_budget: calls.append(query) or None)

    assert client.fetch_region(36.35, 127.38, 900.0) is None
    assert client.fetch_region(36.35, 127.38, 900.0) is None
    assert client.fetch_region(36.35, 127.38, 900.0) is None

    assert len(calls) == 1


def test_failed_download_is_retried_after_failure_window(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "_download", lambda query, *_budget: calls.append(query) or None)
    clock = {"now": 1000.0}
    monkeypatch.setattr(client.time, "monotonic", lambda: clock["now"])

    client.fetch_region(36.35, 127.38, 900.0)
    clock["now"] += client.FAILURE_TTL_S + 1
    client.fetch_region(36.35, 127.38, 900.0)

    assert len(calls) == 2


def test_recovered_download_is_cached_and_clears_failure(monkeypatch):
    payload = {"elements": []}
    responses = iter([None, payload])
    calls = []
    monkeypatch.setattr(client, "_download", lambda query, *_budget: calls.append(query) or next(responses))
    clock = {"now": 1000.0}
    monkeypatch.setattr(client.time, "monotonic", lambda: clock["now"])

    assert client.fetch_region(36.35, 127.38, 900.0) is None
    clock["now"] += client.FAILURE_TTL_S + 1
    region = client.fetch_region(36.35, 127.38, 900.0)
    assert region is not None
    assert client.fetch_region(36.35, 127.38, 900.0) is region
    assert len(calls) == 2


def test_each_mirror_wait_is_capped_and_total_fits_app_timeout():
    # 앱 요청 제한 20초 안에 OSRM 예산(6초)과 여유가 남아야 한다
    assert client.MIRROR_TIMEOUT_S <= client.TIMEOUT_S
    assert client.TIMEOUT_S + 6.0 <= 15.0
    assert os.environ.get("OSM_GRAPH_ROUTING") == "1"


def test_request_budget_total_fits_app_timeout():
    """단계마다 받은 몫을 다 쓰더라도 합계가 요청 전체 예산(앱 제한 20초보다 작다)을 넘지 않아야 한다."""
    from services import request_budget as rb

    assert rb.TOTAL_BUDGET_S < 20.0
    spent = 0.0
    for stage in ("weather_s", "overpass_s", "osrm_s"):
        # 앞 단계가 받은 몫을 모두 쓴 것으로 보고 남은 시간에서 다음 몫을 계산한다
        budget = rb.RequestBudget(deadline=time.monotonic() + rb.TOTAL_BUDGET_S - spent)
        spent += getattr(budget, stage)()
    assert spent <= rb.TOTAL_BUDGET_S


def test_request_budget_keeps_warm_path_unchanged():
    """날씨·주변 길이 캐시에 있으면(시간을 쓰지 않으면) OSRM 몫은 예전과 같은 6초다."""
    from services import request_budget as rb

    assert rb.RequestBudget.start().osrm_s() == rb.OSRM_MAX_S


def test_concurrent_regions_do_not_wait_for_each_other(monkeypatch):
    """서로 다른 지역 조회는 서로를 기다리지 않는다 (예전에는 전역 락 때문에 직렬화됐다)."""
    started = threading.Event()
    release = threading.Event()

    def blocking_download(_query, *_budget):
        started.set()
        release.wait(5.0)
        return {"elements": []}

    monkeypatch.setattr(client, "_download", blocking_download)
    slow = threading.Thread(target=client.fetch_region, args=(37.56, 126.97, 900.0))
    slow.start()
    assert started.wait(2.0)

    monkeypatch.setattr(client, "_download", lambda _query, *_budget: {"elements": []})
    begin = time.monotonic()
    assert client.fetch_region(36.35, 127.38, 900.0) is not None  # 다른 지역이므로 바로 끝나야 한다
    elapsed = time.monotonic() - begin
    release.set()
    slow.join(5.0)
    assert elapsed < 1.0


def test_same_region_requests_share_one_download(monkeypatch):
    """같은 지역을 동시에 찾으면 외부 조회는 한 번만 한다 (프리페치가 겹칠 때 대기가 쌓이지 않게)."""
    calls = []

    def counted(query, *_budget):
        calls.append(query)
        time.sleep(0.3)
        return {"elements": []}

    monkeypatch.setattr(client, "_download", counted)
    threads = [threading.Thread(target=client.fetch_region, args=(36.35, 127.38, 900.0)) for _ in range(4)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(5.0)

    assert len(calls) == 1


def test_exhausted_budget_skips_the_download(monkeypatch):
    """앞 단계가 예산을 다 쓰면 조회하지 않고 바로 None (OSRM 경로로 넘긴다)."""
    calls = []
    monkeypatch.setattr(client, "_download", lambda query, *_budget: calls.append(query) or {"elements": []})

    assert client.fetch_region(36.35, 127.38, 900.0, budget_s=0.0) is None
    assert calls == []


def test_budget_caps_the_download_wait(monkeypatch):
    """budget_s 를 주면 그 시간을 _download 에 넘긴다 (요청 전체 예산 안에서만 기다린다)."""
    seen = []
    monkeypatch.setattr(client, "_download",
                        lambda query, total_s: seen.append(total_s) or {"elements": []})

    client.fetch_region(36.35, 127.38, 900.0, budget_s=2.5)
    assert seen == [2.5]
