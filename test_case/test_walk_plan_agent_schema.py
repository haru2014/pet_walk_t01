"""[US-A1, US-A2, US-E3] AI Agent 의도 파싱, Local-First 프로필 및 무상태 피드백 보정 TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-A1] 자연어 산책 요청 파싱 및 조건 구조화:
  - 사용자 발화에서 target_duration, avoid_stairs, slope_preference, shade_priority 추출
  - Pydantic V2 Strict Schema 검증 (10~90분, 좌표 유효범위, 선호 노면)
  - 불명확한 질의 시 안전 기본값(20분, 완만 경사, 계단 회피, 그늘 우선) 폴백
- [US-A2] 반려견 프로필 로컬 저장 및 JSON 파일 백업/복원:
  - Local-First (AsyncStorage @PawTrail:dog_profile) 영속화
  - 프로필 JSON 내보내기/가져오기(Export/Import) 데이터 무결성 보장
  - 웰니스 카피라이팅 가드레일 (슬개골 탈구 등 임상 질병 용어 검출 0건)
- [US-E3] 로컬 누적 피드백 기반 무상태(Stateless) AI 추천 보정:
  - 클라이언트가 최근 피드백 요약(예: "경사 불만족 1회") 전달 시 최대 허용 경사도 1~2% 하향 조정
"""

import pytest
import json
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError

AllowedSurface = Literal["grass", "dirt", "rubber", "paved", "asphalt", "gravel"]
SlopePreference = Literal["gentle", "very_gentle", "steep_avoid", "none"]


class ClientDogContext(BaseModel):
    """클라이언트 로컬에서 요청 시 동봉하는 반려견 프로필 맥락 (US-A1, US-A2)."""
    dog_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    breed: str = Field(..., min_length=1)
    age_years: int = Field(..., ge=0, le=30)
    weight_kg: float = Field(..., gt=0.0, le=120.0)
    joint_care_level: int = Field(default=0, ge=0, le=4, description="관절 안심 케어 수준 (0~4)")
    speed_kmh: float = Field(default=2.8, gt=0.0)
    default_preferred_surfaces: List[AllowedSurface] = Field(default_factory=lambda: ["dirt", "grass"])


class FeedbackSummaryItem(BaseModel):
    """최근 산책 체감 피드백 요약 아이템 (US-E3 무상태 페이로드)."""
    tag: str = Field(..., description="피드백 태그 (예: too_steep, cool_shade, rough_surface)")
    count: int = Field(..., ge=1)


class WalkIntent(BaseModel):
    """[US-A1] 자연어 발화에서 추출된 산책 의도 구조화 모델."""
    target_duration_minutes: int = Field(default=25, ge=10, le=90)
    avoid_stairs: bool = Field(default=True)
    slope_preference: SlopePreference = Field(default="gentle")
    shade_priority: bool = Field(default=False)
    preferred_surfaces: List[AllowedSurface] = Field(default_factory=lambda: ["dirt", "grass"])
    extraction_confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class WalkPlanRequest(BaseModel):
    """[US-A1] POST /api/v1/walk/plan 요청 본문 DTO (Stateless Payload)."""
    origin_lat: float = Field(..., ge=-90.0, le=90.0)
    origin_lon: float = Field(..., ge=-180.0, le=180.0)
    target_duration_minutes: int = Field(..., ge=10, le=90)
    avoid_stairs: bool = Field(default=True)
    slope_preference: SlopePreference = Field(default="gentle")
    shade_priority: bool = Field(default=False)
    client_dog_context: Optional[ClientDogContext] = None
    client_recent_feedback: List[FeedbackSummaryItem] = Field(default_factory=list)
    user_query: Optional[str] = None


def parse_natural_language_walk_query(user_query: str) -> WalkIntent:
    """[US-A1] 자연어 발화에서 시간, 계단, 경사, 그늘 선호 엔티티를 파싱하는 함수 (Mock / Logic)."""
    intent = WalkIntent()
    query_lower = user_query.lower()

    # 시간 추출 (예: "20분", "30 min")
    import re
    duration_match = re.search(r"(\d+)\s*(?:분|min)", user_query)
    if duration_match:
        dur = int(duration_match.group(1))
        intent.target_duration_minutes = max(10, min(90, dur))

    # 계단 회피
    if "계단" in user_query:
        if "피해" in user_query or "안돼" in user_query or "없이" in user_query or "회피" in user_query:
            intent.avoid_stairs = True

    # 경사도 선호
    if "완만" in user_query or "평지" in user_query:
        intent.slope_preference = "gentle"
    elif "가파른" in user_query and "피해" in user_query:
        intent.slope_preference = "steep_avoid"

    # 그늘 선호
    if "그늘" in user_query or "시원한" in user_query or "더워" in user_query:
        intent.shade_priority = True

    # 노면 선호
    surfaces = []
    if "흙" in user_query:
        surfaces.append("dirt")
    if "잔디" in user_query:
        surfaces.append("grass")
    if "탄성" in user_query or "우레탄" in user_query:
        surfaces.append("rubber")
    if surfaces:
        intent.preferred_surfaces = surfaces

    return intent


def build_fallback_walk_intent() -> WalkIntent:
    """[US-A1] 질의 추출 실패 또는 불명확한 입력 시 기본 안전 프리셋 반환."""
    return WalkIntent(
        target_duration_minutes=20,
        avoid_stairs=True,
        slope_preference="gentle",
        shade_priority=True,
        preferred_surfaces=["dirt", "grass"],
        extraction_confidence=0.5
    )


def calibrate_max_slope_with_feedback(base_max_slope: float, feedback_list: List[FeedbackSummaryItem]) -> float:
    """[US-E3] 클라이언트 피드백(경사 불만족 등)에 따른 최대 허용 경사도 보정 함수."""
    calibrated_slope = base_max_slope
    for fb in feedback_list:
        if fb.tag == "too_steep":
            # 경사 불만족 1회당 1.0%p씩 하향 (최대 3%p 하향, 최저 3.0%까지)
            reduction = min(3.0, fb.count * 1.0)
            calibrated_slope = max(3.0, calibrated_slope - reduction)
    return round(calibrated_slope, 1)


# ==========================================
# 테스트 스위트
# ==========================================

class TestWalkIntentNaturalLanguageParsing:
    """[US-A1] 대화형 자연어 산책 요청 파싱 및 스키마 검증 테스트."""

    def test_parse_maltese_senior_query(self):
        """'9살 노령견이라 계단 피하고 완만한 길로 20분 가볍게 산책하고 싶어' 발화 파싱 검증."""
        query = "9살 노령견이라 계단 피하고 완만한 길로 20분 가볍게 산책하고 싶어"
        intent = parse_natural_language_walk_query(query)

        assert intent.target_duration_minutes == 20
        assert intent.avoid_stairs is True
        assert intent.slope_preference == "gentle"

    def test_parse_summer_shade_dirt_query(self):
        """'날이 더워서 시원한 그늘길이랑 흙길 위주로 30분 코스 짜줘' 발화 파싱 검증."""
        query = "날이 더워서 시원한 그늘길이랑 흙길 위주로 30분 코스 짜줘"
        intent = parse_natural_language_walk_query(query)

        assert intent.target_duration_minutes == 30
        assert intent.shade_priority is True
        assert "dirt" in intent.preferred_surfaces

    def test_fallback_intent_applied_for_unclear_query(self):
        """불명확한 발화 시 기본 안전 프리셋(20분, 완만 경사, 계단 회피) 폴백 적용 검증."""
        fallback = build_fallback_walk_intent()
        assert fallback.target_duration_minutes == 20
        assert fallback.avoid_stairs is True
        assert fallback.slope_preference == "gentle"
        assert fallback.extraction_confidence == 0.5

    def test_valid_stateless_walk_plan_request(self):
        """클라이언트 로컬 프로필과 피드백이 동봉된 정상 요청 Pydantic V2 검증 통과."""
        payload = {
            "origin_lat": 37.4979,
            "origin_lon": 127.0276,
            "target_duration_minutes": 25,
            "avoid_stairs": True,
            "slope_preference": "gentle",
            "shade_priority": True,
            "client_dog_context": {
                "dog_id": "dog-001",
                "name": "코코",
                "breed": "말티즈",
                "age_years": 4,
                "weight_kg": 3.2,
                "joint_care_level": 2,
                "speed_kmh": 2.8,
                "default_preferred_surfaces": ["dirt", "grass"]
            },
            "client_recent_feedback": [
                {"tag": "too_steep", "count": 1}
            ]
        }
        req = WalkPlanRequest(**payload)
        assert req.origin_lat == 37.4979
        assert req.client_dog_context.name == "코코"
        assert req.client_recent_feedback[0].tag == "too_steep"

    @pytest.mark.parametrize("invalid_duration", [5, 95, 0, -10])
    def test_duration_out_of_slider_range_raises_error(self, invalid_duration):
        """산책 시간이 10~90분 슬라이더 범위를 벗어날 때 ValidationError 발생 검증."""
        payload = {
            "origin_lat": 37.4979,
            "origin_lon": 127.0276,
            "target_duration_minutes": invalid_duration
        }
        with pytest.raises(ValidationError):
            WalkPlanRequest(**payload)


class TestDogProfileLocalStorageAndBackup:
    """[US-A2] 반려견 프로필 로컬 저장 및 JSON 백업/복원 무결성 테스트."""

    def test_dog_profile_serialization_and_deserialization(self, sample_dog_profiles):
        """로컬 AsyncStorage용 프로필 직렬화 및 역직렬화(JSON 백업/복원) 무결성 검증."""
        profile_data = sample_dog_profiles["tester1_maltese"]
        context = ClientDogContext(
            dog_id=profile_data["dog_id"],
            name=profile_data["name"],
            breed=profile_data["breed"],
            age_years=profile_data["age"],
            weight_kg=profile_data["weight_kg"],
            joint_care_level=profile_data["joint_care_level"],
            speed_kmh=profile_data["speed_kmh"],
            default_preferred_surfaces=profile_data["default_preferred_surfaces"]
        )

        # JSON 내보내기 시뮬레이션
        json_exported = context.model_dump_json(indent=2)
        assert "코코" in json_exported
        assert "joint_care_level" in json_exported

        # JSON 가져오기(복원) 시뮬레이션
        imported_dict = json.loads(json_exported)
        restored_context = ClientDogContext(**imported_dict)
        assert restored_context.dog_id == context.dog_id
        assert restored_context.weight_kg == context.weight_kg
        assert restored_context.joint_care_level == 2

    def test_wellness_copywriting_guardrail(self, sample_dog_profiles):
        """앱 프로필 및 설명 텍스트에서 임상 질병 단어(슬개골 탈구 등) 검출 0건 가드레일 검증."""
        forbidden_words = ["슬개골 탈구", "질환 단계", "관절염 환견", "질병 등급", "수술 필요"]
        
        for key, profile in sample_dog_profiles.items():
            profile_text = json.dumps(profile, ensure_ascii=False)
            for word in forbidden_words:
                assert word not in profile_text, f"금지된 질병 단어 '{word}'가 프로필에 검출되었습니다: {key}"


class TestStatelessFeedbackAdaptation:
    """[US-E3] 로컬 누적 피드백 기반 무상태(Stateless) 추천 보정 테스트."""

    def test_steep_dissatisfaction_lowers_max_slope_criteria(self):
        """'경사 불만족' 피드백 1회 전달 시 기본 최대 경사도 8.0%가 7.0%로 하향 조정되는지 검증."""
        base_slope = 8.0
        feedback = [FeedbackSummaryItem(tag="too_steep", count=1)]
        calibrated = calibrate_max_slope_with_feedback(base_slope, feedback)

        assert calibrated == 7.0

    def test_multiple_steep_dissatisfactions_capped_at_safe_floor(self):
        """'경사 불만족' 5회 누적 시에도 안전 하한선(3.0% 이상) 이하로 떨어지지 않도록 방어 검증."""
        base_slope = 8.0
        feedback = [FeedbackSummaryItem(tag="too_steep", count=5)]
        calibrated = calibrate_max_slope_with_feedback(base_slope, feedback)

        # 8.0 - min(3.0, 5.0) = 5.0%
        assert calibrated == 5.0
        assert calibrated >= 3.0

    def test_neutral_or_positive_feedback_maintains_slope(self):
        """그늘 만족 등 무관한 피드백 전달 시 기본 경사도 기준이 그대로 유지되는지 검증."""
        base_slope = 8.0
        feedback = [FeedbackSummaryItem(tag="cool_shade", count=3)]
        calibrated = calibrate_max_slope_with_feedback(base_slope, feedback)

        assert calibrated == 8.0


