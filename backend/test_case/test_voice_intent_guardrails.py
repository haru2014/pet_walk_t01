"""음성 JSON 계약·모델 실패·대기 예산 회귀 검증. 외부 API는 호출하지 않는다."""
import json
import sys
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from pydantic import ValidationError
from services import voice_intent_service as service
from agent.walk_limits import MAX_WALK_MINUTES, MIN_WALK_MINUTES
from services.voice_intent_contract import VoiceWalkIntentPayload


@pytest.mark.parametrize("word", ["탈진", "화상", "열사병", "관절염", "슬개골", "수술", "질병"])
def test_model_briefing_is_sanitized(word):
    payload = VoiceWalkIntentPayload(briefing_message=f"{word} 위험")
    assert word not in payload.briefing_message
    assert "편안한" in payload.briefing_message


def test_aliases_keep_existing_response_names():
    payload = VoiceWalkIntentPayload(duration_minutes=40, prefer_soft_surface=False)
    assert payload.model_dump()["target_duration_minutes"] == 40
    assert payload.model_dump()["prefer_cushion"] is False


@pytest.mark.parametrize("values", [
    {"duration_minutes": "30"}, {"duration_minutes": MAX_WALK_MINUTES + 1},  # 한도 초과 (한도: agent/walk_limits.py, 이슈 #125)
    {"duration_minutes": MIN_WALK_MINUTES - 1}, {"prefer_shade": "false"},
])
def test_invalid_contract_is_rejected(values):
    with pytest.raises(ValidationError):
        VoiceWalkIntentPayload(**values)


@pytest.mark.parametrize("park", ["미지원공원", "알수없는공원"])
def test_unknown_park_is_preserved_without_substitution(park):
    payload = service.extract_local_voice_intent(f"{park}에서 그늘 위주로 30분 산책할래")
    assert payload.destination_landmark == park
    assert payload.target_duration_minutes == 30
    assert payload.prefer_shade is True
    assert service.resolve_landmark_park_id(park) is None


@pytest.fixture
def sdk(monkeypatch):
    client = SimpleNamespace(models=SimpleNamespace(generate_content=Mock()), close=Mock())
    factory = Mock(return_value=client)
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        HttpRetryOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
    )
    monkeypatch.setitem(sys.modules, "google.genai", SimpleNamespace(Client=factory, types=fake_types))
    monkeypatch.setattr(service.time, "monotonic", lambda: 0)
    return client, factory


def test_structured_output_falls_through_invalid_json_and_sanitizes(sdk):
    client, factory = sdk
    client.models.generate_content.side_effect = [
        SimpleNamespace(text="invalid json"),
        SimpleNamespace(text=json.dumps({
            "duration_minutes": 30, "prefer_soft_surface": False, "briefing_message": "화상 위험",
        })),
    ]
    payload, model, source = service.parse_voice_walk_intent("유림공원 30분", api_key="test-key")
    assert source == "gemini_live"
    assert model == service.DEFAULT_GEMINI_CANDIDATES[1]
    assert payload.prefer_cushion is False
    assert "화상" not in payload.briefing_message
    first_config = client.models.generate_content.call_args_list[0].kwargs["config"]
    assert first_config["response_schema"] is VoiceWalkIntentPayload
    assert first_config["response_mime_type"] == "application/json"
    assert factory.call_args.kwargs["http_options"]["retry_options"]["attempts"] == 1
    client.close.assert_called_once()


def test_all_models_fail_then_use_local_parser(sdk):
    client, _ = sdk
    client.models.generate_content.side_effect = TimeoutError("unavailable")
    payload, _, source = service.parse_voice_walk_intent("유림공원 30분", api_key="test-key")
    assert source == "local_fallback"
    assert payload.destination_landmark == "유림공원"
    assert [call.kwargs["model"] for call in client.models.generate_content.call_args_list] == service.DEFAULT_GEMINI_CANDIDATES
    client.close.assert_called_once()


def test_exhausted_budget_stops_next_model(sdk, monkeypatch):
    client, _ = sdk
    ticks = iter([0.0, 0.0, 3.0])
    monkeypatch.setattr(service.time, "monotonic", lambda: next(ticks))
    client.models.generate_content.side_effect = TimeoutError("timeout")
    _, _, source = service.parse_voice_walk_intent("유림공원 30분", api_key="test-key")
    assert source == "local_fallback"
    assert client.models.generate_content.call_count == 1


def test_missing_key_never_initializes_sdk(sdk, monkeypatch):
    _, factory = sdk
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    _, _, source = service.parse_voice_walk_intent("30분 산책")
    assert source == "local_fallback"
    factory.assert_not_called()
