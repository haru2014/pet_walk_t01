"""[편안하개 - PetWalk]
Gemini API 기반 음성 의도 분석 및 산책 오케스트레이션 서비스 (voice_intent_service.py)

docs/implementation_plan/gemini_api_적용_계획.md 준수:
1. [영역 1] 음성입력 분석 (Speech & Voice Intent Analysis)
   - Pydantic VoiceWalkIntentPayload 구조화 출력 (Structured Output)
   - Gemini 모델 체인 (3.5 Flash-Lite -> 3.1 Flash-Lite -> 3.6 Flash) Cascading Fallback
   - 오프라인/키 부재 시 로컬 룰베이스 파서(extract_local_voice_intent) 안전망
   - 의료/공포 슬랭 원천 차단 (Zero Medical Slang: "탈진/화상" 배제, 웰니스 어휘 사용)
2. [영역 2] 산책 경로 생성 오케스트레이션 연동 지원
   - 대전/세종 4대 거점 공원 랜드마크 자동 식별 (유림공원, 세종호수공원, 송강근린공원, 도안공원)
"""

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# 대전·세종 4대 거점 공원 랜드마크 매핑 테이블
LANDMARK_TO_PARK_ID = {
    "유림공원": "yurim",
    "유림": "yurim",
    "갑천": "yurim",
    "세종호수공원": "sejong",
    "세종호수": "sejong",
    "호수공원": "sejong",
    "송강공원": "songgang",
    "송강근린공원": "songgang",
    "송강": "songgang",
    "도안공원": "doan",
    "도안호수공원": "doan",
    "도안": "doan",
}

DEFAULT_GEMINI_CANDIDATES = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.6-flash",
]

BLOCKED_GEMINI_MODELS = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
]


class VoiceWalkIntentPayload(BaseModel):
    """[US-A1, 영역 1] Gemini Structured Output 및 오프라인 안전망 데이터 계약 규격."""
    target_duration_minutes: int = Field(default=30, ge=10, le=90, description="목표 산책 시간(분)")
    prefer_shade: bool = Field(default=True, description="그늘길 우선 여부")
    prefer_cushion: bool = Field(default=True, description="폭신한 흙길/잔디 우선 여부")
    avoid_stairs: bool = Field(default=True, description="계단 회피 여부")
    joint_care_level: int = Field(default=1, ge=0, le=2, description="관절 케어 레벨 (0:기본, 1:안심, 2:주의)")
    destination_landmark: Optional[str] = Field(default=None, description="목적지 거점/공원 랜드마크 (예: 유림공원)")
    max_surface_temp_limit: float = Field(default=35.0, description="지면온도 상한치(℃)")
    briefing_message: Optional[str] = Field(default=None, description="상황 맞춤 웰니스 브리핑 문구")


def resolve_landmark_park_id(landmark: Optional[str]) -> Optional[str]:
    """자연어 발화에서 추출된 랜드마크 명칭을 4대 거점 공원 ID로 정규화."""
    if not landmark:
        return None
    cleaned = landmark.strip()
    for key in sorted(LANDMARK_TO_PARK_ID.keys(), key=len, reverse=True):
        if key in cleaned:
            return LANDMARK_TO_PARK_ID[key]
    return None


def _extract_duration(text: str) -> int:
    if re.search(r"(?:1\s*시간|한\s*시간)\s*(?:반|30\s*분)", text):
        return 90
    if re.search(r"[1한]\s*시간", text):
        return 60
    if "반시간" in text:
        return 30
    match = re.search(r"(\d{1,3})\s*(?:분|min)", text)
    if match:
        return max(10, min(90, int(match.group(1))))
    return 30


def _extract_destination(text: str) -> Optional[str]:
    for key in sorted(LANDMARK_TO_PARK_ID.keys(), key=len, reverse=True):
        if key in text:
            return key if "공원" in key else f"{key}공원"
    return None


def _extract_joint_level(text: str) -> int:
    if any(w in text for w in ["관절", "다리", "슬개골", "무리 없", "천천히", "완만"]):
        return 2
    if any(w in text for w in ["신나게", "뛰", "달리", "활발"]):
        return 0
    return 1


def extract_local_voice_intent(speech_text: str, dog_name: Optional[str] = None) -> VoiceWalkIntentPayload:
    """[오프라인 안전망] 네트워크 단절 또는 API 키 부재 시 정규식/키워드 기반 즉각 파싱."""
    text = speech_text.strip()
    name = dog_name or "아이"

    duration = _extract_duration(text)
    prefer_shade = any(w in text for w in ["그늘", "시원", "더위", "덥", "뜨거", "햇빛", "햇볕"])
    prefer_cushion = not any(w in text for w in ["아스팔트", "딱딱한 길 좋아"])
    avoid_stairs = not any(w in text for w in ["계단 괜찮", "계단 포함", "계단 상관없", "계단 좋아"])
    destination_landmark = _extract_destination(text)
    joint_level = _extract_joint_level(text)

    landmark_str = f"{destination_landmark} " if destination_landmark else ""
    briefing = f"{landmark_str}{name}와 함께하는 {duration}분 맞춤 안심 산책 코스를 설정했습니다."

    return VoiceWalkIntentPayload(
        target_duration_minutes=duration,
        prefer_shade=prefer_shade,
        prefer_cushion=prefer_cushion,
        avoid_stairs=avoid_stairs,
        joint_care_level=joint_level,
        destination_landmark=destination_landmark,
        max_surface_temp_limit=35.0,
        briefing_message=briefing,
    )


def _build_system_prompt(dog_name: Optional[str]) -> str:
    name = dog_name or "반려견"
    return f"""당신은 반려견 맞춤형 안심 산책 플랫폼 '편안하개'의 AI 산책 의도 분석 전문가입니다.
보호자의 자연어 음성 발화에서 산책 의도 파라미터를 정확히 추출하여 지정된 JSON 스키마로 응답하십시오.

[의료/공포 슬랭 원천 차단 가이드라인 (Zero Medical Slang)]
1. '탈진', '화상 위험', '관절염 악화', '열사병' 등의 부정적/공포감 유발 단어를 브리핑 문구(briefing_message)에 절대 사용하지 마십시오.
2. 항상 '발바닥 패드가 편안한 안심 코스', '안전하고 시원한 산책로' 등 긍정적인 웰니스 표현으로 다듬어 주세요.
3. 대상 반려견 이름: {name}

[추출 규칙]
- target_duration_minutes: 10~90분 사이 정수 (미언급 시 30)
- prefer_shade: 그늘길/시원한 길 선호 여부 (날씨가 덥거나 그늘 요청 시 true)
- prefer_cushion: 흙길/잔디/폭신한 길 선호 여부 (기본 true)
- avoid_stairs: 계단 회피 여부 (기본 true)
- joint_care_level: 0(활발), 1(일반안심), 2(완만/슬개골 주의)
- destination_landmark: 유림공원, 세종호수공원, 송강근린공원, 도안공원 등 특정 거점/공원 언급 시 추출
- briefing_message: 2문장 이내의 다정하고 안심되는 산책 코스 안내 브리핑 (예: "{name}와 함께 걷기 좋은 25분 그늘 흙길 코스를 준비했어요.")
"""


def parse_voice_walk_intent(
    speech_text: str,
    dog_name: Optional[str] = None,
    api_key: Optional[str] = None,
) -> Tuple[VoiceWalkIntentPayload, str, str]:
    """Gemini API 호출 및 후보 모델 Cascading Fallback을 통해 음성 의도 분석.

    Returns:
        (VoiceWalkIntentPayload, model_used, data_source)
    """
    cleaned_text = speech_text.strip()
    if not cleaned_text:
        fallback = extract_local_voice_intent("30분 천천히 걷기", dog_name)
        return fallback, "local-fallback", "local_fallback"

    gemini_key = api_key or os.getenv("GEMINI_API_KEY")

    # 1. API 키가 없으면 즉시 로컬 안전망 실행
    if not gemini_key or not gemini_key.strip():
        logger.info("GEMINI_API_KEY 미설정: 로컬 룰베이스 음성 의도 분석기 가동")
        payload = extract_local_voice_intent(cleaned_text, dog_name)
        return payload, "local-rule-engine", "local_fallback"

    # 2. Gemini 클라이언트 호출 (google.genai SDK 동적 로드)
    try:
        import importlib
        genai = importlib.import_module("google.genai")
        types = getattr(genai, "types")

        client = genai.Client(api_key=gemini_key.strip())
        system_prompt = _build_system_prompt(dog_name)

        # Cascading Fallback 모델 체인 (3.5 Flash-Lite -> 3.1 Flash-Lite -> 3.6 Flash)
        for model_name in DEFAULT_GEMINI_CANDIDATES:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=f"보호자 음성 발화: \"{cleaned_text}\"",
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        response_schema=VoiceWalkIntentPayload,
                        temperature=0.2,
                    ),
                )
                if response and response.text:
                    parsed_dict = json.loads(response.text)
                    payload = VoiceWalkIntentPayload(**parsed_dict)
                    return payload, model_name, "gemini_live"
            except Exception as model_err:
                logger.warning("Gemini 모델 %s 호출 실패 (%s), 다음 후보 모델 시도", model_name, model_err)
                continue

    except Exception as exc:
        logger.warning("Gemini SDK 초기화/호출 실패 (%s), 로컬 안전망 폴백", exc)

    # 3. 모든 Gemini 모델 호출 실패 시 로컬 안전망 실행
    local_payload = extract_local_voice_intent(cleaned_text, dog_name)
    return local_payload, "local-fallback-engine", "local_fallback"
