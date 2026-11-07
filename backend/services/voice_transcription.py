"""Gemini audio transcription for walk commands."""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

TRANSCRIPTION_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
]

GEMINI_TRANSCRIPTION_TIMEOUT_MS = 10000


def transcribe_walk_command(
    audio_data: bytes,
    mime_type: str,
    dog_name: str = "",
    api_key: Optional[str] = None,
) -> str:
    """Return only the spoken words from a short walk-command recording."""
    gemini_key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    if not gemini_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    if not audio_data:
        raise ValueError("녹음된 음성이 비어 있습니다.")

    import importlib
    genai = importlib.import_module("google.genai")
    types = getattr(genai, "types")

    http_options = types.HttpOptions(
        timeout=GEMINI_TRANSCRIPTION_TIMEOUT_MS,
        retry_options=types.HttpRetryOptions(attempts=1),
    )
    client = genai.Client(api_key=gemini_key, http_options=http_options)

    system_instruction = (
        "당신은 반려견 맞춤형 안심 산책 플랫폼 '편안하개'의 음성 전사(STT) 비서입니다.\n"
        "사용자가 녹음한 음성을 듣고 한국어 발화 내용을 정확하게 텍스트로 받아써주세요.\n"
        "주요 공원 및 산책 키워드: 유림공원, 세종호수공원, 송강근린공원(송강공원), 도안호수공원(갑천생태공원), "
        "산책 시간(10분~90분), 그늘길, 흙길, 잔디길, 완만한 길, 계단피하기 등.\n"
        "규칙:\n"
        "1. 부가 설명, 인사말, 마크다운 기호, 따옴표 없이 사용자가 말한 내용만 그대로 텍스트로 출력하세요.\n"
        "2. 음성에 사람 목소리가 전혀 없거나 알아들을 수 없는 단순 소음/침묵인 경우 빈 문자열을 출력하세요."
    )

    name_hint = dog_name.strip()[:40]
    prompt = (
        f"반려견 이름: {name_hint}\n이 음성의 발화 내용을 있는 그대로 한국어 텍스트로 받아써주세요."
        if name_hint
        else "이 음성의 발화 내용을 있는 그대로 한국어 텍스트로 받아써주세요."
    )

    try:
        audio_part = types.Part.from_bytes(data=audio_data, mime_type=mime_type)
        user_content = [audio_part, prompt]

        for model_name in TRANSCRIPTION_MODELS:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=user_content,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.0,
                        http_options=types.HttpOptions(timeout=GEMINI_TRANSCRIPTION_TIMEOUT_MS),
                    ),
                )
                if response and response.text:
                    transcript = response.text.strip().strip('"\'')
                    if transcript:
                        return transcript
            except Exception as model_err:
                logger.warning(
                    "Gemini 음성 전사 모델 %s 호출 실패 (%s), 다음 후보 모델 시도",
                    model_name,
                    type(model_err).__name__,
                )
                continue

        raise ValueError("음성을 명확히 알아듣지 못했어요. 조금 더 또렷하게 말씀해 주세요.")
    finally:
        try:
            client.close()
        except Exception:
            pass
