"""Unit tests for Gemini audio transcription service and /api/v1/voice/transcribe endpoint."""

import io
from types import SimpleNamespace
from unittest.mock import Mock
import pytest
from fastapi.testclient import TestClient

import main
from services import voice_transcription


client = TestClient(main.app)


def test_transcribe_walk_command_missing_api_key(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    with pytest.raises(RuntimeError) as exc_info:
        voice_transcription.transcribe_walk_command(b"fake_audio", "audio/wav")
    assert "GEMINI_API_KEY is not configured" in str(exc_info.value)


def test_transcribe_walk_command_empty_audio(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")
    with pytest.raises(ValueError) as exc_info:
        voice_transcription.transcribe_walk_command(b"", "audio/wav")
    assert "녹음된 음성이 비어 있습니다" in str(exc_info.value)


def test_transcribe_walk_command_success(monkeypatch):
    fake_response = SimpleNamespace(text="유림공원 30분 산책하자")
    mock_generate = Mock(return_value=fake_response)
    fake_client = SimpleNamespace(
        models=SimpleNamespace(generate_content=mock_generate),
        close=Mock(),
    )
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        HttpRetryOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
        Part=SimpleNamespace(from_bytes=lambda **kwargs: kwargs),
    )
    fake_genai = SimpleNamespace(Client=Mock(return_value=fake_client), types=fake_types)

    monkeypatch.setattr("importlib.import_module", lambda name: fake_genai if name == "google.genai" else __import__(name))
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")

    result = voice_transcription.transcribe_walk_command(b"fake_wav_data", "audio/wav", dog_name="초코")
    assert result == "유림공원 30분 산책하자"
    assert mock_generate.call_count == 1
    call_kwargs = mock_generate.call_args[1]
    assert call_kwargs["model"] == "gemini-3.5-flash-lite"


def test_transcribe_walk_command_cascading_fallback(monkeypatch):
    # First candidate model fails, second candidate succeeds
    fake_response = SimpleNamespace(text="세종호수공원 40분")
    mock_generate = Mock(side_effect=[Exception("Quota exceeded"), fake_response])
    fake_client = SimpleNamespace(
        models=SimpleNamespace(generate_content=mock_generate),
        close=Mock(),
    )
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        HttpRetryOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
        Part=SimpleNamespace(from_bytes=lambda **kwargs: kwargs),
    )
    fake_genai = SimpleNamespace(Client=Mock(return_value=fake_client), types=fake_types)

    monkeypatch.setattr("importlib.import_module", lambda name: fake_genai if name == "google.genai" else __import__(name))
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")

    result = voice_transcription.transcribe_walk_command(b"fake_audio", "audio/m4a")
    assert result == "세종호수공원 40분"
    assert mock_generate.call_count == 2


def test_transcribe_walk_command_all_candidates_fail(monkeypatch):
    mock_generate = Mock(side_effect=Exception("API unavailable"))
    fake_client = SimpleNamespace(
        models=SimpleNamespace(generate_content=mock_generate),
        close=Mock(),
    )
    fake_types = SimpleNamespace(
        HttpOptions=lambda **kwargs: kwargs,
        HttpRetryOptions=lambda **kwargs: kwargs,
        GenerateContentConfig=lambda **kwargs: kwargs,
        Part=SimpleNamespace(from_bytes=lambda **kwargs: kwargs),
    )
    fake_genai = SimpleNamespace(Client=Mock(return_value=fake_client), types=fake_types)

    monkeypatch.setattr("importlib.import_module", lambda name: fake_genai if name == "google.genai" else __import__(name))
    monkeypatch.setenv("GEMINI_API_KEY", "fake_key")

    with pytest.raises(ValueError) as exc_info:
        voice_transcription.transcribe_walk_command(b"fake_audio", "audio/m4a")
    assert "음성을 명확히 알아듣지 못했어요" in str(exc_info.value)


# Endpoint tests (/api/v1/voice/transcribe)

def test_endpoint_transcribe_success(monkeypatch):
    monkeypatch.setattr(main, "transcribe_walk_command", lambda data, mime, dog: "송강공원 20분 그늘길")
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("voice.m4a", io.BytesIO(b"audio_bytes"), "audio/m4a")},
        data={"dog_name": "초코", "mime_type": "audio/m4a"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["transcript"] == "송강공원 20분 그늘길"
    assert data["model_used"] == "gemini-3.5-flash-lite"


def test_endpoint_transcribe_unsupported_mime():
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("test.txt", io.BytesIO(b"text"), "text/plain")},
        data={"mime_type": "text/plain"},
    )
    assert response.status_code == 415
    assert "지원하지 않는 음성 파일 형식" in response.json()["detail"]


def test_endpoint_transcribe_empty_audio():
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("empty.m4a", io.BytesIO(b""), "audio/m4a")},
        data={"mime_type": "audio/m4a"},
    )
    assert response.status_code == 400
    assert "녹음된 음성이 비어 있습니다" in response.json()["detail"]


def test_endpoint_transcribe_no_key_503(monkeypatch):
    def fake_transcribe(*args, **kwargs):
        raise RuntimeError("GEMINI_API_KEY is not configured")

    monkeypatch.setattr(main, "transcribe_walk_command", fake_transcribe)
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("test.m4a", io.BytesIO(b"audio"), "audio/m4a")},
        data={"mime_type": "audio/m4a"},
    )
    assert response.status_code == 503
    assert "음성 인식 서비스를 사용할 수 없습니다" in response.json()["detail"]


def test_endpoint_transcribe_gemini_error_502(monkeypatch):
    def fake_transcribe(*args, **kwargs):
        raise Exception("Google API Error")

    monkeypatch.setattr(main, "transcribe_walk_command", fake_transcribe)
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("test.m4a", io.BytesIO(b"audio"), "audio/m4a")},
        data={"mime_type": "audio/m4a"},
    )
    assert response.status_code == 502
    assert "Gemini 음성 인식에 실패했습니다" in response.json()["detail"]


def test_endpoint_transcribe_filename_mime_inference(monkeypatch):
    captured_mime = []

    def fake_transcribe(audio_data, mime_type, dog_name):
        captured_mime.append(mime_type)
        return "파일 확장자 추론 성공"

    monkeypatch.setattr(main, "transcribe_walk_command", fake_transcribe)
    response = client.post(
        "/api/v1/voice/transcribe",
        files={"audio": ("walk-recording.m4a", io.BytesIO(b"dummy_audio_bytes"), "application/octet-stream")},
        data={"mime_type": ""},
    )
    assert response.status_code == 200
    assert response.json()["transcript"] == "파일 확장자 추론 성공"
    assert captured_mime == ["audio/m4a"]

