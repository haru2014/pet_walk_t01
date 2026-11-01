"""앱 산책 설정의 체크 항목(계단 피하기·그늘·폭신한 길·요청 문장)이 맞춤 조건으로 전달되는지 확인한다.

예전에는 서버가 avoid_stairs·prefer_shade·prefer_cushion·request_text 를 읽지 않아, 앱에서 무엇을 골라도 추천이 같았다.
"""
from fastapi.testclient import TestClient

import main
from agent.walk_planning_agent import WalkIntent, apply_intent_overrides

client = TestClient(main.app)
YURIM = {"origin_mode": "park", "pilot_park_id": "yurim", "origin_lat": 36.3620608, "origin_lon": 127.3601379,
         "target_duration_minutes": 30, "weather_context": {"current": {"air_temp_celsius": 20.0, "estimated_surface_temp": 22.0}}}


def test_app_fields_become_intent_overrides():
    assert main._app_intent_overrides({"avoid_stairs": False, "prefer_shade": True, "prefer_cushion": True}) == {
        "avoid_stairs": False, "shade_priority": True, "prefer_soft": True}
    assert main._app_intent_overrides({}) == {}  # 보내지 않은 항목은 넣지 않는다 (음성·예전 요청은 그대로)


def test_overrides_follow_the_app_checkboxes():
    intent = apply_intent_overrides(WalkIntent(), {"avoid_stairs": False, "shade_priority": True, "prefer_soft": True})
    assert intent.avoid_stairs is False
    assert intent.shade_priority is True
    assert {"dirt", "grass", "rubber"} <= set(intent.preferred_surfaces)
    # 체크하지 않은 그늘은 요청 문장에서 읽은 그늘 선호를 지우지 않는다
    assert apply_intent_overrides(WalkIntent(shade_priority=True), {"shade_priority": False}).shade_priority is True


def test_walk_plan_passes_app_settings_to_the_agent(monkeypatch):
    seen = {}
    real = main.run_walk_planning_agent

    def spy(**kwargs):
        result = real(**kwargs)
        seen.update(query=kwargs["user_query"], intent=result.intent)
        return result

    monkeypatch.setattr(main, "run_walk_planning_agent", spy)
    res = client.post("/api/v1/walk/plan", json={
        **YURIM, "avoid_stairs": False, "prefer_shade": False, "prefer_cushion": True, "request_text": "그늘 많은 길이면 좋겠어요"})
    assert res.status_code == 200
    assert "폭신한 길 위주로" not in seen["query"] and "그늘 많은 길" in seen["query"]
    assert seen["intent"].target_duration_minutes == 30
    assert seen["intent"].avoid_stairs is False
    assert seen["intent"].shade_priority is True  # 요청 문장의 '그늘'
    assert "dirt" in seen["intent"].preferred_surfaces  # '폭신한 길' 체크


def test_shade_setting_changes_the_ranking_in_yurim():
    plain = client.post("/api/v1/walk/plan", json={**YURIM, "prefer_shade": False}).json()
    shade = client.post("/api/v1/walk/plan", json={**YURIM, "prefer_shade": True}).json()
    assert [c["id"] for c in plain["courses"]] != [c["id"] for c in shade["courses"]] or plain["score"] != shade["score"]
