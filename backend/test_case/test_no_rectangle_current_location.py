"""[3번 노희선 - 서버] 현재 위치 모드에서 직사각형(건물을 관통하는 대체 경로)을 후보로 내보내지 않는다.

승현 님 폰 캡처(2026-10-22 10:29, 애경연구원 근처): 후보 3개 중 3번 코스가 네모로 나왔다.
운영 서버에서 같은 위치를 재현하면 OSRM 호출은 성공(실패 0)인데 후보 1개가 rectangle_fallback 이었다
-> OSRM 응답이 조건(거리 오차·순환 종결·왕복 비율)에서 탈락한 후보가 곧바로 네모로 떨어진 것.

규칙
- 탈락한 후보는 방향을 바꿔 한 번 더 시도한다.
- 그래도 안 되면 그 후보는 빼고 나머지만 낸다 (네모를 내지 않는다).
- 후보가 하나도 없을 때만 예전처럼 직사각형을 낸다 (OSRM 전면 장애 시에도 200 응답 유지).
"""

import agent.loop_route_planner as lrp

# 대전 유성구 애경연구원 근처 (서울광장 정적 코스 반경 밖)
ORIGIN = (36.3905, 127.3490)
TARGET_M = 1400.0


def _live_plan(variant, bearing_offset=0.0):
    # 후보마다 다른 길이어야 한다 (같은 길은 하나만 남기는 규칙 때문)
    coords = [[127.349 + i * 0.0001 + variant * 0.01, 36.3905 + i * 0.0001] for i in range(20)]
    return lrp._to_plan(coords, "osrm_live")


def _no_offline_fallbacks(monkeypatch):
    monkeypatch.setattr(lrp, "_plan_static_seoul", lambda *a, **k: None)
    monkeypatch.setattr(lrp, "_plan_offline_network", lambda *a, **k: None)


def test_failed_candidate_is_dropped_not_rectangle(monkeypatch):
    """3번 후보가 방향을 바꿔도 실패하면 3번만 빠지고 네모는 나오지 않는다."""
    _no_offline_fallbacks(monkeypatch)

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0, **kwargs):
        return None if variant == 3 else _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M)
    assert sorted(plans) == [1, 2]
    assert all(p.source == "osrm_live" for p in plans.values())


def test_failed_candidate_is_retried_with_another_bearing(monkeypatch):
    """처음 방향에서 탈락한 후보는 다른 방향으로 다시 시도해 3개를 채운다 (두 번째 방향에서 성공)."""
    _no_offline_fallbacks(monkeypatch)
    calls = []

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0, **kwargs):
        calls.append((variant, bearing_offset))
        if variant == 3 and bearing_offset in (0.0, lrp.RETRY_BEARING_OFFSETS[0]):
            return None
        return _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M)
    assert sorted(plans) == [1, 2, 3]
    assert all(p.source == "osrm_live" for p in plans.values())
    assert [off for v, off in calls if v == 3] == [0.0, *lrp.RETRY_BEARING_OFFSETS[:2]]


def test_all_failed_still_returns_fallback(monkeypatch):
    """OSRM 이 전면 장애면 예전처럼 직사각형 3개로 응답한다 (빈 응답/오류 방지)."""
    _no_offline_fallbacks(monkeypatch)
    monkeypatch.setattr(lrp, "_plan_live", lambda *a, **k: None)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M)
    assert sorted(plans) == [1, 2, 3]
    assert all(p.source == "rectangle_fallback" for p in plans.values())


def test_retry_skipped_when_budget_exhausted(monkeypatch):
    """시간 예산이 끝났으면 재시도하지 않고 후보를 뺀다 (앱 대기 시간 보호)."""
    _no_offline_fallbacks(monkeypatch)
    calls = []

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0, **kwargs):
        calls.append((variant, bearing_offset))
        return None if variant == 3 else _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M, time_budget_s=0.0)
    assert sorted(plans) == [1, 2]
    assert all(off == 0.0 for _, off in calls)


def test_invalid_loop_is_not_refined_but_left_to_bearing_retry(monkeypatch):
    """순환이 닫히지 않는 방향은 반경 보정(OSRM 추가 호출)을 하지 않고 바로 포기한다 (예산을 방향 교체에 쓰기 위해)."""
    calls = []

    def open_line(waypoints, timeout_seconds=3.0, use_cache=True):
        calls.append(1)
        coords = [[127.349 + i * 0.0005, 36.3905] for i in range(20)]  # 출발지로 돌아오지 않는 직선
        return coords, 900.0, 100.0

    monkeypatch.setattr(lrp, "fetch_osrm_foot_route", open_line)
    plan = lrp._plan_live(*ORIGIN, TARGET_M, 3, lrp.time.monotonic() + 60)
    assert plan is None
    assert len(calls) == 1
