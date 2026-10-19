"""[편안하개 - PetWalk]
Gemini 음성 의도 분석 및 오케스트레이션 단위 테스트 (test_voice_intent_service.py)
"""

import pytest
from services import voice_intent_service
from services.voice_intent_service import (
    VoiceWalkIntentPayload,
    extract_local_voice_intent,
    resolve_landmark_park_id,
    parse_voice_walk_intent,
)


def test_extract_local_voice_intent_complex():
    text = "날씨가 더우니까 뽀삐랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어"
    payload = extract_local_voice_intent(text, dog_name="뽀삐")

    assert payload.target_duration_minutes == 25
    assert payload.prefer_shade is True
    assert payload.prefer_cushion is True
    assert payload.avoid_stairs is True
    assert payload.destination_landmark == "유림공원"
    assert "유림공원" in payload.briefing_message
    assert "뽀삐" in payload.briefing_message


def test_extract_local_voice_intent_stairs_allowed():
    text = "유림공원에서 계단 괜찮으니까 40분 활발하게 걷자"
    payload = extract_local_voice_intent(text, dog_name="초코")

    assert payload.target_duration_minutes == 40
    assert payload.avoid_stairs is False
    assert payload.destination_landmark == "유림공원"
    assert payload.joint_care_level == 0


def test_resolve_landmark_park_id():
    assert resolve_landmark_park_id("유림공원") == "yurim"
    assert resolve_landmark_park_id("갑천 둔치") == "yurim"
    assert resolve_landmark_park_id("세종호수공원") == "sejong"
    assert resolve_landmark_park_id("송강공원") == "songgang"
    assert resolve_landmark_park_id("송강근린공원") == "songgang"
    assert resolve_landmark_park_id("도안호수공원") == "doan"
    assert resolve_landmark_park_id("갑천생태공원") == "doan"
    assert resolve_landmark_park_id("도안호수공원(갑천생태공원)") == "doan"
    assert resolve_landmark_park_id("알 수 없는 장소") is None
    assert resolve_landmark_park_id(None) is None


def test_parse_voice_walk_intent_fallback_without_key():
    # API 키가 없거나 테스트 환경일 때도 로컬 안전망으로 즉시 100% 정상 응답
    payload, model, source = parse_voice_walk_intent(
        "30분 동안 계단 없이 시원하게 산책할래",
        dog_name="해피",
        api_key=None,
    )
    assert isinstance(payload, VoiceWalkIntentPayload)
    assert payload.target_duration_minutes == 30
    assert payload.avoid_stairs is True
    assert payload.prefer_shade is True
    assert source == "local_fallback"


def test_voice_intent_api_endpoint():
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)
    res = client.post(
        "/api/v1/voice/intent",
        json={"speech_text": "날씨가 더우니까 뽀삐랑 25분만 그늘진 흙길로 유림공원 한 바퀴 돌고 싶어", "dog_name": "뽀삐"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["landmark_park_id"] == "yurim"
    intent = data["intent"]
    assert intent["target_duration_minutes"] == 25
    assert intent["prefer_shade"] is True
    assert intent["prefer_cushion"] is True
    assert intent["avoid_stairs"] is True
    assert intent["destination_landmark"] == "유림공원"

