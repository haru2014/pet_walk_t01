"""[이슈 #280] POST /api/v1/community/share — 빈 경로 저장, 거리·시간 고정값, 같은 주소 이중 등록.

- 마스킹 뒤 남는 점이 2개 미만이면 저장하지 않고 422 로 거절한다.
- 거리·시간은 공개되는(마스킹된) 경로로 계산한다 (예전: 모든 공유가 1.4km·22분 고정).
- 같은 주소가 한 번만 등록돼 있다 (예전: 두 번 등록돼 뒤의 것은 실행되지 않았다).
"""
import pytest
from fastapi.testclient import TestClient

import agent.supabase_repository as supabase_repository
import main
from agent.supabase_repository import community_repo

client = TestClient(main.app)

# 약 2.1km 직선 경로 [경도, 위도] — 출발·도착 200m 를 빼도 점이 남는다.
LONG_ROUTE = [[127.38 + i * 0.0002, 36.435 + i * 0.0001] for i in range(100)]
# 출발 근처만 걸은 경로(약 50m) — 마스킹 뒤 남는 경로가 없다.
SHORT_ROUTE = [[127.38 + i * 0.00005, 36.435] for i in range(10)]


@pytest.fixture(autouse=True)
def _isolated_memory_feeds(monkeypatch):
    """공유 목록(전역 메모리)에 남기지 않는다. 다른 테스트가 '첫 항목은 기본 피드'라고 가정한다."""
    monkeypatch.setattr(supabase_repository, "_memory_feeds", list(supabase_repository._memory_feeds))


def _payload(route, title="마스킹 테스트 산책로"):
    return {"user_id": "usr_test_280", "course_title": title, "raw_coordinates": route, "satisfaction_rating": 4}


def test_route_is_registered_once():
    routes = [r for r in main.app.routes if getattr(r, "path", "") == "/api/v1/community/share" and "POST" in getattr(r, "methods", set())]
    assert len(routes) == 1


def test_short_route_is_rejected_and_not_saved():
    before = len(community_repo.get_feeds())
    res = client.post("/api/v1/community/share", json=_payload(SHORT_ROUTE))
    assert res.status_code == 422, res.text
    assert res.json()["detail"]["code"] == "ROUTE_TOO_SHORT_TO_MASK"
    assert len(community_repo.get_feeds()) == before


def test_distance_and_duration_come_from_the_shared_route_not_fixed_values():
    res = client.post("/api/v1/community/share", json=_payload(LONG_ROUTE))
    assert res.status_code == 200, res.text
    body = res.json()
    feed = body["feed"]
    assert body["status"] == "shared"
    assert len(feed["masked_polyline"]) >= 2
    expected = sum(
        main._haversine_distance_meters(a[1], a[0], b[1], b[0])
        for a, b in zip(feed["masked_polyline"][:-1], feed["masked_polyline"][1:])
    )
    assert abs(feed["distance_m"] - round(expected)) <= 1
    assert (feed["distance_m"], feed["duration_min"]) != (1400.0, 22)
    assert feed["duration_min"] == max(10, round(expected / 60.0))


def test_different_routes_get_different_distances():
    a = client.post("/api/v1/community/share", json=_payload(LONG_ROUTE[:60], "짧은 코스")).json()["feed"]
    b = client.post("/api/v1/community/share", json=_payload(LONG_ROUTE, "긴 코스")).json()["feed"]
    assert a["distance_m"] < b["distance_m"]
    assert a["course_id"] != b["course_id"]
