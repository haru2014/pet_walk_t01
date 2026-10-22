"""Gemini 3.8 Flash-Lite TTS audio generation."""

import os

from google import genai


GEMINI_TTS_MODEL = "gemini-3.8-flash-lite-tts"


def generate_speech_audio(text: str, voice: str, style: str) -> bytes:
    """Generate WAV audio for a short navigation announcement."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    client = genai.Client(api_key=api_key)
    interaction = client.interactions.create(
        model=GEMINI_TTS_MODEL,
        input=[{
            "type": "user_input",
            "content": [{
                "type": "text",
                "text": text,
                "annotations": [{"type": "speech_metadata", "style": style}],
            }],
        }],
        response_format={"type": "audio"},
        generation_config={"speech_config": [{"voice": voice}]},
    )
    audio = getattr(interaction, "output_audio", None)
    audio_data = getattr(audio, "data", None)
    if not audio_data:
        raise RuntimeError("Gemini TTS returned no audio")
    import base64

    return base64.b64decode(audio_data)
