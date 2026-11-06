"""Overpass 조회가 실패해도 한 요청 안에서 같은 지역을 반복해 받으며 시간을 쓰지 않는다.

예전에는 실패가 캐시되지 않아, 후보 3개의 큰길 검사·지표 계산이 각각 4초씩 다시 기다려
서버 응답이 앱 제한(20초)을 넘겼고 앱은 '현재 위치 주변 경로를 확인할 수 없습니다'를 띄웠다.
"""

import os

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
    monkeypatch.setattr(client, "_download", lambda query: calls.append(query) or None)

    assert client.fetch_region(36.35, 127.38, 900.0) is None
    assert client.fetch_region(36.35, 127.38, 900.0) is None
    assert client.fetch_region(36.35, 127.38, 900.0) is None

    assert len(calls) == 1


def test_failed_download_is_retried_after_failure_window(monkeypatch):
    calls = []
    monkeypatch.setattr(client, "_download", lambda query: calls.append(query) or None)
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
    monkeypatch.setattr(client, "_download", lambda query: calls.append(query) or next(responses))
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
