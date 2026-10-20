"""음성 의도 JSON 계약과 화면·음성 안내용 웰니스 문구 검증."""

from typing import Optional

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class VoiceWalkIntentPayload(BaseModel):
    model_config = ConfigDict(strict=True)

    target_duration_minutes: int = Field(
        default=30, ge=10, le=90,
        validation_alias=AliasChoices("target_duration_minutes", "duration_minutes"),
    )
    prefer_shade: bool = True
    prefer_cushion: bool = Field(
        default=True, validation_alias=AliasChoices("prefer_cushion", "prefer_soft_surface"),
    )
    avoid_stairs: bool = True
    joint_care_level: int = Field(default=1, ge=0, le=2)
    destination_landmark: Optional[str] = None
    max_surface_temp_limit: float = Field(default=33.0, allow_inf_nan=False)
    briefing_message: Optional[str] = None

    @field_validator("briefing_message")
    @classmethod
    def sanitize_briefing(cls, value: Optional[str]) -> Optional[str]:
        blocked_words = ("탈진", "화상", "열사병", "관절염", "슬개골", "수술", "질병")
        if value and any(word in value for word in blocked_words):
            return "발바닥이 편안한 길에서 여유롭게 산책하고, 필요하면 시원한 곳에서 쉬어 주세요."
        return value
