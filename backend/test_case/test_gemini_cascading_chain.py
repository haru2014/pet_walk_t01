"""[US-A1, US-D1] Gemini 3.x Cascading Chain 및 무키 로컬 안전망(No-Key Safety Net) 전수 검증 모듈.

다음 주(10/26~10/30) 과제 3-2 요구사항:
1. Gemini 모델 순차 우선순위 체인: 3.5 Flash-Lite -> 3.1 Flash-Lite -> 3.6 Flash
2. 구형 Gemini 1.5 계열(1.5 Flash, 1.5 Pro) 원천 차단
3. GEMINI_API_KEY 미설정/부재 시 지체 없는 로컬 룰베이스 안전망(extract_local_voice_intent) 즉각 폴백
4. 시간 초과/네트워크 오류 시 예외 없이 로컬 안전망 폴백 및 Zero Medical Slang 보장
"""

import pytest
from services.voice_intent_service import (
    DEFAULT_GEMINI_CANDIDATES,
    BLOCKED_GEMINI_MODELS,
    parse_voice_walk_intent,
    extract_local_voice_intent,
    resolve_landmark_park_id,
)
from services.voice_intent_contract import VoiceWalkIntentPayload


class TestGeminiCascadingModelChain:
    """Gemini 3.x 모델 우선순위 체인 및 1.5 차단 규격 검증."""

    def test_default_candidates_priority_order(self):
        """1순위 3.5-flash-lite, 2순위 3.1-flash-lite, 3순위 3.6-flash 순서 검증."""
        assert DEFAULT_GEMINI_CANDIDATES == [
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.6-flash",
        ]

    def test_gemini_1_5_models_are_strictly_blocked(self):
        """Gemini 1.5 구형 계열이 후보에 포함되지 않고 차단 목록에 존재하는지 검증."""
        for blocked in BLOCKED_GEMINI_MODELS:
            assert blocked not in DEFAULT_GEMINI_CANDIDATES
        assert "gemini-1.5-flash" in BLOCKED_GEMINI_MODELS
        assert "gemini-1.5-pro" in BLOCKED_GEMINI_MODELS


class TestNoKeyLocalSafetyNet:
    """API 키 미설정 및 오프라인 환경에서의 무키 로컬 안전망 검증."""

    def test_no_api_key_falls_back_instantly_to_local_rule_engine(self):
        """API 키가 없을 때 대기 시간 없이 로컬 룰 엔진으로 즉각 폴백 검증."""
        speech = "초코랑 40분 동안 유림공원에서 계단 없이 천천히 걷자"
        payload, model_used, data_source = parse_voice_walk_intent(
            speech_text=speech,
            dog_name="초코",
            api_key=None,
        )

        assert isinstance(payload, VoiceWalkIntentPayload)
        assert data_source == "local_fallback"
        assert model_used in ("local-rule-engine", "local-fallback")
        assert payload.target_duration_minutes == 40
        assert payload.avoid_stairs is True
        assert payload.destination_landmark == "유림공원"
        assert resolve_landmark_park_id(payload.destination_landmark) == "yurim"

    def test_empty_speech_returns_safe_default_preset(self):
        """빈 발화 입력 시 안전 기본 프리셋(30분, 완만) 반환 검증."""
        payload, model_used, data_source = parse_voice_walk_intent("", dog_name="토리")
        assert payload.target_duration_minutes == 30
        assert data_source == "local_fallback"

    def test_local_engine_landmark_resolution_four_pilot_parks(self):
        """대전/세종 4대 거점 공원 랜드마크 인식 및 park_id 매핑 검증."""
        assert resolve_landmark_park_id("유림공원") == "yurim"
        assert resolve_landmark_park_id("송강근린공원") == "songgang"
        assert resolve_landmark_park_id("세종호수공원") == "sejong"
        assert resolve_landmark_park_id("도안호수공원") == "doan"
        assert resolve_landmark_park_id("갑천생태공원") == "doan"

    def test_zero_medical_slang_in_local_briefing(self):
        """로컬 엔진 브리핑 문구에서 공포/임상 질병 용어가 원천 배제되는지 검증."""
        payload = extract_local_voice_intent("다리가 불편해서 무리 없는 코스 찾아줘", dog_name="맥스")
        briefing = payload.briefing_message
        forbidden_slang = ["슬개골", "탈구", "심장마비", "열사병", "화상", "질환", "환견", "부상"]
        for slang in forbidden_slang:
            assert slang not in briefing, f"금지된 질병/공포 슬랭 발견: {slang}"
