"""Gemini audio transcription for walk commands."""

from io import BytesIO
import os

from google import genai


GEMINI_TRANSCRIPTION_MODEL = "gemini-3.5-transcribe"


def transcribe_walk_command(audio_data: bytes, mime_type: str, dog_name: str = "") -> str:
    """Return only the spoken words from a short walk-command recording."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured")
    if not audio_data:
        raise ValueError("Audio recording is empty")

    client = genai.Client(api_key=api_key)
    uploaded_file = None
    try:
        types = genai.types
        uploaded_file = client.files.upload(
            file=BytesIO(audio_data),
            config=types.UploadFileConfig(mime_type=mime_type),
        )
        vocabulary = ["유림공원", "세종호수공원", "송강공원", "도안호수공원"]
        if dog_name.strip():
            vocabulary.append(dog_name.strip()[:40])
        interaction = client.interactions.create(
            model=GEMINI_TRANSCRIPTION_MODEL,
            input=[{
                "type": "audio",
                "uri": uploaded_file.uri,
                "mime_type": uploaded_file.mime_type or mime_type,
            }],
            generation_config={
                "transcription_config": {
                    "language_codes": ["ko-KR"],
                    "custom_vocabulary": vocabulary,
                },
            },
        )
        transcript = (interaction.output_text or "").strip()
        if not transcript:
            raise ValueError("Gemini returned an empty transcript")
        return transcript
    finally:
        if uploaded_file is not None and uploaded_file.name:
            try:
                client.files.delete(name=uploaded_file.name)
            except Exception:
                # Keep cleanup best-effort so a delete failure does not mask transcription.
                pass
        client.close()
