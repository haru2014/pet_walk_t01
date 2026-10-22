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
    coords = [[127.349 + i * 0.0001, 36.3905 + i * 0.0001] for i in range(20)]
    return lrp._to_plan(coords, "osrm_live")


def _no_offline_fallbacks(monkeypatch):
    monkeypatch.setattr(lrp, "_plan_static_seoul", lambda *a, **k: None)
    monkeypatch.setattr(lrp, "_plan_offline_network", lambda *a, **k: None)


def test_failed_candidate_is_dropped_not_rectangle(monkeypatch):
    """3번 후보가 방향을 바꿔도 실패하면 3번만 빠지고 네모는 나오지 않는다."""
    _no_offline_fallbacks(monkeypatch)

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0):
        return None if variant == 3 else _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M)
    assert sorted(plans) == [1, 2]
    assert all(p.source == "osrm_live" for p in plans.values())


def test_failed_candidate_is_retried_with_another_bearing(monkeypatch):
    """처음 방향에서 탈락한 후보는 다른 방향으로 한 번 더 시도해 3개를 채운다."""
    _no_offline_fallbacks(monkeypatch)
    calls = []

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0):
        calls.append((variant, bearing_offset))
        if variant == 3 and bearing_offset == 0.0:
            return None
        return _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M)
    assert sorted(plans) == [1, 2, 3]
    assert all(p.source == "osrm_live" for p in plans.values())
    assert calls.count((3, 0.0)) == 1
    assert any(v == 3 and off != 0.0 for v, off in calls)


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

    def fake_live(lat, lon, target, variant, deadline, bearing_offset=0.0):
        calls.append((variant, bearing_offset))
        return None if variant == 3 else _live_plan(variant)

    monkeypatch.setattr(lrp, "_plan_live", fake_live)
    plans = lrp.plan_loop_candidates(*ORIGIN, TARGET_M, time_budget_s=0.0)
    assert sorted(plans) == [1, 2]
    assert all(off == 0.0 for _, off in calls)
