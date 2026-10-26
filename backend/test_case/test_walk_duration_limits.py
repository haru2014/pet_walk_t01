"""[이슈 #125 후속] 산책 시간 한도는 앱이 고를 수 있는 값과 같아야 한다.

앱(frontend/src/types/walkSettings.ts)은 15~120분을 고르게 하는데 서버는 10~90분만 받아
105분·120분을 고르면 400 오류로 "경로 생성 안 됨"이 되었다. (운영 서버 로그의 400 두 줄로 확인)
한도를 한 곳(agent/walk_limits.py)에서 관리하고, 앱 옵션과 어긋나면 이 테스트가 실패한다.
"""

import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from agent.walk_limits import MAX_WALK_MINUTES, MIN_WALK_MINUTES
from agent.walk_planning_agent import WalkIntent, _extract_target_duration
from services.voice_intent_contract import VoiceWalkIntentPayload

client = TestClient(main.app)
FRONTEND_SETTINGS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "types" / "walkSettings.ts"
CENTERS = {
    "yurim": (36.3620608, 127.3601379),
    "sejong": (36.4972593, 127.2749633),
    "songgang": (36.4353, 127.3847),
    "doan": (36.332629, 127.3505325),
}


def _body(park, minutes):
    lat, lon = CENTERS[park]
    return {"dog_id": "d", "dog_name": "T", "speed_kmh": 2.8, "joint_care_level": 1, "target_duration_minutes": minutes,
            "origin_mode": "park", "pilot_park_id": park, "origin_lat": lat, "origin_lon": lon, "park_zone": park}


def test_server_limits_cover_every_duration_option_in_the_app():
    text = FRONTEND_SETTINGS.read_text(encoding="utf-8")
    options = [int(n) for n in re.search(r"DURATION_OPTIONS_15MIN[^=]*=\s*\[([^\]]*)\]", text).group(1).replace(" ", "").split(",")]
    assert options, "앱의 산책 시간 옵션을 읽지 못했다"
    assert MIN_WALK_MINUTES <= min(options) and max(options) <= MAX_WALK_MINUTES, (options, MIN_WALK_MINUTES, MAX_WALK_MINUTES)
    max_minutes = re.search(r"maxMinutes:\s*(\d+)", text)
    if max_minutes:
        assert int(max_minutes.group(1)) <= MAX_WALK_MINUTES


@pytest.mark.parametrize("park", list(CENTERS))
@pytest.mark.parametrize("minutes", [105, 120])
def test_every_app_duration_option_gets_routes(park, minutes):
    res = client.post("/api/v1/walk/plan", json=_body(park, minutes))
    assert res.status_code == 200, res.text
    assert len(res.json()["courses"]) == 3


@pytest.mark.parametrize("minutes", [9, 121, 500])
def test_out_of_range_duration_is_rejected_with_the_real_limit_in_the_message(minutes):
    res = client.post("/api/v1/walk/plan", json=_body("yurim", minutes))
    assert res.status_code == 400
    assert f"{MIN_WALK_MINUTES}~{MAX_WALK_MINUTES}분" in res.json()["detail"]


def test_walk_intent_accepts_up_to_the_max_and_rejects_beyond():
    assert WalkIntent(target_duration_minutes=MAX_WALK_MINUTES).target_duration_minutes == MAX_WALK_MINUTES
    with pytest.raises(ValidationError):
        WalkIntent(target_duration_minutes=MAX_WALK_MINUTES + 1)
    with pytest.raises(ValidationError):
        WalkIntent(target_duration_minutes=MIN_WALK_MINUTES - 1)


def test_voice_intent_payload_uses_the_same_limits():
    assert VoiceWalkIntentPayload(duration_minutes=MAX_WALK_MINUTES).target_duration_minutes == MAX_WALK_MINUTES
    with pytest.raises(ValidationError):
        VoiceWalkIntentPayload(duration_minutes=MAX_WALK_MINUTES + 1)


@pytest.mark.parametrize("utterance, expected", [
    ("두 시간 동안 산책하고 싶어", 120),
    ("2시간 걷고 싶어요", 120),
    ("한 시간 반 코스로 가자", 90),
    ("1시간만", 60),
    ("100분 걷자", 100),
    ("300분 걷자", MAX_WALK_MINUTES),  # 한도 밖은 한도로 맞춘다
    ("5분만", MIN_WALK_MINUTES),
])
def test_spoken_duration_follows_the_limits(utterance, expected):
    assert _extract_target_duration(utterance) == expected
