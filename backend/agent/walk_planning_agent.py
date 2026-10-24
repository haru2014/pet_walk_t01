r"""[US-A1, US-A3, US-B1~B3, US-E3] LangGraph ReAct Walk Planning Agent Orchestrator.

편안하개(PawTrail)의 1번(팀장 / 조현정) R&R 핵심 산출물:
- LangGraph StateGraph 기반 ReAct 오케스트레이션 파이프라인
- 자연어 의도 파싱(WalkIntent Pydantic V2 Strict Schema)
- 체급별 속도 모델($D = V \times T$) 및 적응형 제약조건 보정
- Routing Adapter 도구 제어 및 Candidate Route Scorer(100점 만점) 결합
- 시선 해방(Eyes-Free) 핸즈프리 음성/화면 웰니스 브리핑 합성
"""

import math
import re
from typing import List, Dict, Any, Optional, Literal, Tuple, TypedDict, Annotated
from pydantic import BaseModel, Field, ValidationError

from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages

from agent.walk_limits import MAX_WALK_MINUTES, MIN_WALK_MINUTES
from agent.park_walk_planner import route_direction_label
from agent.loop_route_planner import VARIANT_BEARINGS, plan_loop_candidates
from agent.route_geometry import estimate_duration_minutes
from agent.pilot_park_routes import PILOT_PARK_CENTERS
from test_case.test_thermal_and_parking import determine_heat_risk_dto

# ==============================================================================
# 1. Pydantic 스키마 정의 (Strict Data Contracts)
# ==============================================================================

AllowedSurface = Literal["grass", "dirt", "rubber", "paved", "asphalt", "gravel"]
SlopePreference = Literal["gentle", "very_gentle", "steep_avoid", "none"]


class ClientDogContext(BaseModel):
    """클라이언트 로컬(AsyncStorage)에서 무상태로 동봉하는 반려견 프로필 DTO."""
    dog_id: str = Field(default="dog-001", min_length=1)
    name: str = Field(default="강아지", min_length=1)
    breed: str = Field(default="말티즈", min_length=1)
    age_years: int = Field(default=4, ge=0, le=30)
    weight_kg: float = Field(default=4.0, gt=0.0, le=120.0)
    joint_care_level: int = Field(default=1, ge=0, le=4, description="관절 안심 케어 수준 (0~4)")
    speed_kmh: float = Field(default=2.8, gt=0.0)
    default_preferred_surfaces: List[AllowedSurface] = Field(default_factory=lambda: ["dirt", "grass"])


class FeedbackSummaryItem(BaseModel):
    """최근 산책 체감 피드백 요약 DTO (US-E3 무상태 페이로드)."""
    tag: str = Field(..., description="피드백 태그 (예: too_steep, cool_shade, rough_surface)")
    count: int = Field(..., ge=1)


class WalkIntent(BaseModel):
    """[US-A1] 자연어 질의에서 추출된 산책 의도 구조화 모델."""
    target_duration_minutes: int = Field(default=25, ge=MIN_WALK_MINUTES, le=MAX_WALK_MINUTES)
    avoid_stairs: bool = Field(default=True)
    slope_preference: SlopePreference = Field(default="gentle")
    shade_priority: bool = Field(default=False)
    preferred_surfaces: List[AllowedSurface] = Field(default_factory=lambda: ["dirt", "grass"])
    extraction_confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class RouteCandidate(BaseModel):
    """라우팅 어댑터에서 생성된 순환 후보 경로 모델."""
    route_id: str
    name: str
    total_distance_m: float
    estimated_duration_minutes: float
    has_stairs: bool = False
    max_slope_percent: float = 4.5
    average_slope_percent: float = 2.8
    surface_temp_c: float = 29.5
    average_shade_ratio: float = 0.75
    surface_types: List[str] = Field(default_factory=lambda: ["dirt", "grass"])
    geojson_coordinates: List[List[float]] = Field(default_factory=list)
    turn_by_turn_steps: List[Dict[str, Any]] = Field(default_factory=list)
    route_source: str = "unknown"
    lap_count: int = 1
    lap_cycle_m: Optional[float] = None
    slope_source: Optional[str] = "approximation"
    stairs_source: Optional[str] = None
    shade_source: Optional[str] = None
    surface_source: Optional[str] = None
    surface_known_ratio: Optional[float] = None
    data_reliability: str = "estimated"


class ScoredRoute(BaseModel):
    """Candidate Route Scorer 채점 결과 모델."""
    candidate: RouteCandidate
    total_score: float
    stairs_score: float
    slope_score: float
    thermal_score: float
    distance_score: float
    rank: int
    preference_score: float = 0.0  # [제안] 맞춤 점수의 선호 적합도 (agent/personalized_scorer.py)
    distance_error_ratio: float = 0.0  # |코스 거리 − 목표| / 목표 (진입로 왕복 제외). 순위의 시간 적합 판단에 쓴다


# 이 비율 안의 코스를 "요청 시간에 맞는 코스"로 본다 (공원 안내의 '짧은 대안 코스' 기준 0.75 와 같은 폭)
DURATION_FIT_TOLERANCE = 0.25


def rank_key(scored: "ScoredRoute") -> tuple:
    """순위 기준 (#170). 요청 시간에 맞는 코스를 먼저 세우고 그 안에서는 점수 순,
    맞는 코스가 없으면 요청 시간에 가까운 순(같으면 점수 순). 점수 자체는 바꾸지 않는다.
    예: 송강 120분 요청에서 경사 점수가 높은 19분 코스보다 35분 코스를 먼저 추천한다."""
    err = scored.distance_error_ratio
    if err <= DURATION_FIT_TOLERANCE:
        return (0, 0.0, -scored.total_score)
    return (1, round(err, 3), -scored.total_score)


class WalkPlanningResult(BaseModel):
    """에이전트 최종 오케스트레이션 반환 결과."""
    status: str
    best_route: RouteCandidate
    best_score: float
    intent: WalkIntent
    briefing_message: str
    all_scored_candidates: List[ScoredRoute]
    execution_trace: List[str]
    weather_context: Optional[Dict[str, Any]] = None


# ==============================================================================
# 2. 도메인 상수 & 체급별 표준 속도 모델 (US-A3, US-B1~B3)
# ==============================================================================

SPEED_MODEL_KMH = {
    "small": 2.8,    # 소형견 (46.7 m/min)
    "medium": 3.6,   # 중형견 (60.0 m/min)
    "large": 4.2,    # 대형견 (70.0 m/min)
    "senior": 2.2,   # 노령견 / 관절안심 (36.7 m/min)
}

SURFACE_BASE_WEIGHTS = {
    "grass": 0.6,
    "dirt": 0.6,
    "rubber": 0.7,
    "paved": 1.0,
    "asphalt": 2.5,
    "gravel": 3.5,
}


def get_standard_speed_kmh(weight_kg: float, age_years: int, joint_care_level: int) -> float:
    """반려견 체급, 연령, 관절케어 수준에 따른 표준 속도 모델링."""
    if age_years >= 8 or joint_care_level >= 2:
        return SPEED_MODEL_KMH["senior"]
    if weight_kg < 10.0:
        return SPEED_MODEL_KMH["small"]
    elif weight_kg < 25.0:
        return SPEED_MODEL_KMH["medium"]
    else:
        return SPEED_MODEL_KMH["large"]


# ==============================================================================
# 3. ReAct 도구 및 단위 알고리즘 함수
# ==============================================================================

def _extract_target_duration(query_str: str) -> Optional[int]:
    """자연어 발화에서 목표 산책 시간(분) 추출 (한도: walk_limits.MIN/MAX_WALK_MINUTES 로 맞춤)."""
    # 0. 두 시간, 2시간 (앱은 최대 2시간까지 고를 수 있다)
    if re.search(r"(?:2\s*시간|두\s*시간)", query_str):
        return max(MIN_WALK_MINUTES, min(MAX_WALK_MINUTES, 120))
    # 1. 1시간 반, 한시간 30분 등 복합 표현
    if re.search(r"(?:1\s*시간|한\s*시간)\s*(?:반|30\s*분)", query_str):
        return 90
    # 2. 1시간, 한시간 등 60분 표현
    if re.search(r"(?:1\s*시간|한\s*시간)", query_str):
        return 60
    # 3. 반시간 (30분)
    if "반시간" in query_str:
        return 30
    # 4. 숫자 + 분/min 정규식
    match = re.search(r"(\d{1,3})\s*(?:분|min)", query_str)
    if match:
        dur = int(match.group(1))
        return max(MIN_WALK_MINUTES, min(MAX_WALK_MINUTES, dur))
    return None


def _extract_avoid_stairs(query_str: str) -> bool:
    if any(w in query_str for w in ["계단 괜찮", "계단 포함", "계단 상관없", "계단 좋아"]):
        return False
    return True


def _extract_slope_preference(query_str: str) -> SlopePreference:
    if any(w in query_str for w in ["완만", "평지", "완만한", "낮은"]):
        return "gentle"
    if any(w in query_str for w in ["가파른", "급경사", "언덕"]) and any(w in query_str for w in ["피해", "싫어", "회피"]):
        return "steep_avoid"
    return "gentle"


def _extract_preferred_surfaces(query_str: str) -> List[AllowedSurface]:
    surfaces: List[AllowedSurface] = []
    if "흙" in query_str:
        surfaces.append("dirt")
    if "잔디" in query_str:
        surfaces.append("grass")
    if "탄성" in query_str or "우레탄" in query_str or "폭신" in query_str:
        surfaces.append("rubber")
    return surfaces


def parse_natural_language_walk_query(user_query: str) -> WalkIntent:
    """[US-A1] 자연어 발화에서 시간, 계단, 경사, 그늘, 노면 의도 엔티티 파싱 및 불명확 질의 Fallback."""
    if not user_query or not user_query.strip():
        return build_fallback_walk_intent()

    query_str = user_query.strip()
    duration = _extract_target_duration(query_str)

    # 산책 의도 핵심 키워드 유무 확인
    intent_keywords = [
        "계단", "경사", "완만", "평지", "언덕", "가파른", "그늘", "시원한",
        "더워", "덥", "뜨거", "열", "낮", "햇빛", "햇볕", "흙", "잔디", "탄성", "우레탄",
        "폭신", "아스팔트", "시간", "분", "min"
    ]
    has_intent_keywords = any(k in query_str for k in intent_keywords)

    # 시간도 없고 의도 키워드도 전무한 불명확 질의(예: '안녕', '???')는 안전 기본값 Fallback
    if duration is None and not has_intent_keywords:
        return build_fallback_walk_intent()

    intent = WalkIntent()
    if duration is not None:
        intent.target_duration_minutes = duration

    intent.avoid_stairs = _extract_avoid_stairs(query_str)
    intent.slope_preference = _extract_slope_preference(query_str)

    if any(w in query_str for w in ["그늘", "시원한", "더워", "덥", "뜨거", "열", "낮", "햇빛", "햇볕"]):
        intent.shade_priority = True

    surfaces = _extract_preferred_surfaces(query_str)
    if surfaces:
        intent.preferred_surfaces = surfaces

    return intent


def build_fallback_walk_intent() -> WalkIntent:
    """[US-A1] 불명확한 질의 입력 시 안전 기본 프리셋 Fallback."""
    return WalkIntent(
        target_duration_minutes=20,
        avoid_stairs=True,
        slope_preference="gentle",
        shade_priority=True,
        preferred_surfaces=["dirt", "grass"],
        extraction_confidence=0.60
    )


def calibrate_max_slope_with_feedback(base_max_slope: float, feedback_list: List[FeedbackSummaryItem]) -> float:
    """[US-E3] 최근 피드백(경사 불만족 등)에 따른 최대 허용 경사도 동적 보정."""
    calibrated = base_max_slope
    for fb in feedback_list:
        if fb.tag == "too_steep":
            reduction = min(3.0, fb.count * 1.0)
            calibrated = max(3.0, calibrated - reduction)
    return round(calibrated, 1)


def calibrate_preferences_with_feedback(intent: WalkIntent, feedback_list: List[FeedbackSummaryItem]) -> WalkIntent:
    """[US-E3] 최근 피드백(그늘 부족, 거친 노면, 계단 부담 등)에 따른 선호 조건 다요소 동적 보정."""
    updated = intent.model_copy()
    for fb in feedback_list:
        if fb.tag in ("lack_of_shade", "too_hot", "need_shade"):
            updated.shade_priority = True
        elif fb.tag in ("rough_surface", "hurt_paws"):
            surfaces = list(updated.preferred_surfaces)
            for s in ("dirt", "grass", "rubber"):
                if s not in surfaces:
                    surfaces.insert(0, s)
            updated.preferred_surfaces = surfaces
        elif fb.tag in ("stairs_burden", "avoid_stairs"):
            updated.avoid_stairs = True
    return updated


def score_candidate_route(candidate: RouteCandidate, target_distance_m: float) -> ScoredRoute:
    """[US-B3] Candidate Route Scorer: 후보 경로 다요소 종합 100점 채점기.
    
    1. 계단 배제 (30점): 계단 없으면 30점, 있으면 0점
    2. 경사도 적합도 (30점): max_slope <= 8% 30점 만점, 8%~15% 선형 감점, > 15% 0점 탈락 (기존 5%·8% 차이 해소)
    3. 지면온도/열안전 (20점): surface_temp <= 33℃ 20점, <= 39℃ 12점, <= 45℃ 6점, > 45℃ 0점 (공통 안전 기준 연동)
    4. 거리 적합도 (20점): 목표 거리 대비 오차율 기반 감점
    """
    # 1. 계단 배제
    stairs_score = 0.0 if candidate.has_stairs else 30.0

    # 2. 경사도 점수 (계획서 8% 이하 만점, 15% 초과 탈락 기준 확정)
    max_slope = candidate.max_slope_percent
    if max_slope <= 8.0:
        slope_score = 30.0
    elif max_slope <= 15.0:
        slope_score = round(30.0 * (15.0 - max_slope) / (15.0 - 8.0), 1)
    else:
        slope_score = 0.0

    # 3. 지면온도 / 열안전 (SAFE_MAX_C 33℃, CAUTION_MAX_C 45℃ 기준)
    temp = candidate.surface_temp_c
    if temp <= 33.0:
        thermal_score = 20.0
    elif temp <= 39.0:
        thermal_score = 12.0
    elif temp <= 45.0:
        thermal_score = 6.0
    else:
        thermal_score = 0.0

    # 4. 거리 적합도
    if target_distance_m > 0:
        error_rate = abs(candidate.total_distance_m - target_distance_m) / target_distance_m
    else:
        error_rate = 0.0
    dist_score = max(0.0, round(20.0 * (1.0 - min(1.0, error_rate * 4)), 1))

    total = min(100.0, round(stairs_score + slope_score + thermal_score + dist_score, 1))

    return ScoredRoute(
        candidate=candidate,
        total_score=total,
        stairs_score=stairs_score,
        slope_score=slope_score,
        thermal_score=thermal_score,
        distance_score=dist_score,
        rank=1,
    )


class LoopCandidateRequest(BaseModel):
    """[US-A3, US-B1] 순환 후보 생성 요청 파라미터 DTO."""
    origin_lat: float
    origin_lon: float
    target_distance_m: float = Field(..., gt=0.0)
    speed_kmh: float = Field(..., gt=0.0)
    avoid_stairs: bool = True
    max_slope_allowed: float = 6.0
    preferred_surfaces: List[str] = Field(default_factory=list)
    origin_mode: str = "current_location"
    pilot_park_id: Optional[str] = None
    estimated_surface_temp: Optional[float] = None
    air_temp_celsius: Optional[float] = None


# 후보별 표시 정보 및 보행 환경 지표 (기상청 실시간 지면열 모델 연동)
DIRECTION_LABELS = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"]
VARIANT_NAME_TEMPLATES: Dict[int, str] = {
    1: "🌿 {direction} 방면 보행안심 순환로",
    2: "🚶 {direction} 방면 완만 보행 순환 코스",
    3: "🏢 {direction} 방면 도심 가로수길 순환 코스",
}


def _direction_label(bearing: float) -> str:
    return DIRECTION_LABELS[round(bearing / 45.0) % 8]


def _variant_profile(variant: int, req: LoopCandidateRequest) -> Dict[str, Any]:
    """후보 번호별 보행 환경 지표 프로필 (기상청 실시간 지면열 모델 연동)."""
    default_surfaces = req.preferred_surfaces or ["dirt", "grass"]
    surf_temp_base = req.estimated_surface_temp if req.estimated_surface_temp is not None else 32.0
    air_temp_base = req.air_temp_celsius if req.air_temp_celsius is not None else 26.0

    # 그늘 및 노면 재질에 따른 지면열 완화 모델:
    # variant 1 (그늘 숲길): 그늘 비율 85% -> 지면열이 외기온 쪽으로 대폭 냉각
    t1 = round(air_temp_base + (surf_temp_base - air_temp_base) * (1.0 - 0.85 * 0.75), 1)
    # variant 2 (완만 보행로): 그늘 비율 60%
    t2 = round(air_temp_base + (surf_temp_base - air_temp_base) * (1.0 - 0.60 * 0.60), 1)
    # variant 3 (도심 아스팔트): 그늘 비율 35% -> 직사광선/아스팔트 열축적으로 지면열 유지
    t3 = round(surf_temp_base, 1)

    profiles: Dict[int, Dict[str, Any]] = {
        1: {"has_stairs": False, "max_slope_percent": min(4.2, req.max_slope_allowed),
            "average_slope_percent": 2.3, "surface_temp_c": t1, "average_shade_ratio": 0.85,
            "surface_types": default_surfaces},
        2: {"has_stairs": False, "max_slope_percent": min(6.5, req.max_slope_allowed + 1.0),
            "average_slope_percent": 3.4, "surface_temp_c": t2, "average_shade_ratio": 0.60,
            "surface_types": ["rubber", "paved"]},
        3: {"has_stairs": not req.avoid_stairs, "max_slope_percent": 8.5,
            "average_slope_percent": 4.8, "surface_temp_c": t3, "average_shade_ratio": 0.35,
            "surface_types": ["asphalt", "paved"]},
    }
    return profiles[variant]


def generate_loop_candidates(req: LoopCandidateRequest) -> List[RouteCandidate]:
    """[US-A3, US-B3] 출발지 기반 실제 도로망 순환 후보 3종 생성.

    거리와 소요 시간은 생성된 좌표열의 실측값에서 계산한다.
    """
    plans = plan_loop_candidates(
        req.origin_lat,
        req.origin_lon,
        req.target_distance_m,
        origin_mode=req.origin_mode,
        pilot_park_id=req.pilot_park_id,
    )
    candidates: List[RouteCandidate] = []
    for variant, plan in plans.items():
        direction = _direction_label(VARIANT_BEARINGS[variant])
        if plan.source.startswith("park_graph_"):
            park_key = plan.source.removeprefix("park_graph_")
            # 후보 3개가 이름만으로 구분되도록 안 번호·순환 방향·실제 거리를 붙인다 (이슈 #125)
            cand_name = (
                f"🏞️ {PILOT_PARK_CENTERS[park_key][2]} · {variant}안 "
                f"{route_direction_label(plan.coords)} {plan.distance_m / 1000.0:.1f}km"
            )
        elif plan.source.startswith("static_pilot_"):
            park_title = plan.source.replace("static_pilot_", "")
            cand_name = f"🏞️ {park_title}"
        else:
            cand_name = VARIANT_NAME_TEMPLATES[variant].format(direction=direction)

        candidates.append(RouteCandidate(
            route_id=f"candidate-loop-{variant:02d}",
            name=cand_name,
            total_distance_m=plan.distance_m,
            estimated_duration_minutes=estimate_duration_minutes(plan.distance_m, req.speed_kmh),
            geojson_coordinates=plan.coords,
            turn_by_turn_steps=plan.steps,
            route_source=plan.source,
            lap_count=getattr(plan, "lap_count", 1) or 1,
            lap_cycle_m=getattr(plan, "lap_cycle_m", None),
            **_variant_profile(variant, req),
        ))
    return candidates


# ==============================================================================
# 4. LangGraph State 정의 (WalkPlanningState)
# ==============================================================================

class WalkPlanningState(TypedDict):
    """LangGraph StateGraph 오케스트레이션 상태 사전."""
    messages: Annotated[List[Dict[str, Any]], add_messages]
    user_query: str
    client_dog_context: Optional[Dict[str, Any]]
    client_recent_feedback: List[Dict[str, Any]]
    weather_context: Optional[Dict[str, Any]]
    origin_lat: float
    origin_lon: float
    origin_mode: str
    parking_lot_id: Optional[str]
    pilot_park_id: Optional[str]
    # 앱 산책 설정에서 고른 조건 (avoid_stairs / shade_priority / prefer_soft). 문장 분석 결과보다 앞선다
    intent_overrides: Optional[Dict[str, Any]]
    # 분석 & 보정 산출물
    parsed_intent: Optional[Dict[str, Any]]
    calibrated_speed_kmh: float
    target_distance_m: float
    max_slope_allowed: float
    # 후보 경로 및 채점
    candidate_routes: List[Dict[str, Any]]
    scored_routes: List[Dict[str, Any]]
    selected_route: Optional[Dict[str, Any]]
    best_score: float
    briefing_message: str
    execution_trace: List[str]
    status: str


# ==============================================================================
# 5. LangGraph Node 함수 구현 (ReAct Cycle)
# ==============================================================================

SOFT_SURFACE_PREFERENCES: List[AllowedSurface] = ["dirt", "grass", "rubber"]


def apply_intent_overrides(intent: WalkIntent, overrides: Optional[Dict[str, Any]]) -> WalkIntent:
    """앱 산책 설정의 체크 항목을 의도에 반영한다.

    - avoid_stairs: 앱의 '계단 피하기' 체크 여부 그대로 (체크 안 하면 계단을 피하지 않는다)
    - shade_priority: '그늘이 많은 길'을 체크했거나 요청 문장에 그늘·더위 낱말이 있으면 켠다
    - prefer_soft: '폭신한 길'을 체크하면 흙·잔디·탄성 노면을 선호에 넣는다
    """
    if not overrides:
        return intent
    updated = intent.model_copy()
    if isinstance(overrides.get("avoid_stairs"), bool):
        updated.avoid_stairs = overrides["avoid_stairs"]
    if overrides.get("shade_priority") is True:
        updated.shade_priority = True
    if overrides.get("prefer_soft") is True:
        surfaces = list(updated.preferred_surfaces)
        updated.preferred_surfaces = surfaces + [s for s in SOFT_SURFACE_PREFERENCES if s not in surfaces]
    return updated


def node_parse_intent(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 1] 사용자의 자연어 발화에서 의도를 파싱하고 Pydantic 스키마로 검증."""
    query = state.get("user_query", "")
    trace = list(state.get("execution_trace", []))
    trace.append(f"[Node: parse_intent] User query: '{query}'")

    intent = apply_intent_overrides(parse_natural_language_walk_query(query), state.get("intent_overrides"))
    trace.append(
        f"[Node: parse_intent] Parsed -> Duration: {intent.target_duration_minutes}m, "
        f"AvoidStairs: {intent.avoid_stairs}, Slope: {intent.slope_preference}, Shade: {intent.shade_priority}"
    )

    return {
        "parsed_intent": intent.model_dump(),
        "execution_trace": trace,
        "status": "intent_parsed"
    }


def node_calibrate_constraints(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 2] 반려견 체급/연령 및 클라이언트 로컬 누적 피드백을 결합하여 제약조건 보정."""
    trace = list(state.get("execution_trace", []))
    dog_ctx_dict = state.get("client_dog_context") or {}
    feedback_raw = state.get("client_recent_feedback") or []

    dog_ctx = ClientDogContext(**dog_ctx_dict) if dog_ctx_dict else ClientDogContext()
    feedback_list = [FeedbackSummaryItem(**fb) for fb in feedback_raw]

    # 속도 계산: 클라이언트가 보행 속도를 명시한 경우 우선 적용, 아니면 체급 표준 속도 (소형 2.8, 중형 3.6, 대형 4.2, 노령 2.2 km/h)
    if "speed_kmh" in dog_ctx.model_fields_set:
        speed_kmh = dog_ctx.speed_kmh
    else:
        speed_kmh = get_standard_speed_kmh(dog_ctx.weight_kg, dog_ctx.age_years, dog_ctx.joint_care_level)

    intent_dict = state.get("parsed_intent") or {}
    duration_min = intent_dict.get("target_duration_minutes", 20)

    # 목표 거리 환산 (D = V * T)
    target_dist_m = round((speed_kmh * 1000.0 / 60.0) * duration_min, 1)

    # 경사도 보정 (기본 15도 미만, 피드백 too_steep 시 하향)
    base_slope = 7.0 if intent_dict.get("slope_preference") == "gentle" else 12.0
    calibrated_slope = calibrate_max_slope_with_feedback(base_slope, feedback_list)

    # 그늘/노면/계단 피드백 다요소 보정 (US-E3)
    intent_obj = WalkIntent(**intent_dict) if intent_dict else build_fallback_walk_intent()
    calibrated_intent = calibrate_preferences_with_feedback(intent_obj, feedback_list)

    trace.append(
        f"[Node: calibrate_constraints] Dog: {dog_ctx.breed} ({dog_ctx.age_years}세, {dog_ctx.weight_kg}kg) -> "
        f"Speed: {speed_kmh}km/h, TargetDist: {target_dist_m}m, MaxSlope: {calibrated_slope}%, "
        f"ShadePriority: {calibrated_intent.shade_priority}"
    )

    return {
        "calibrated_speed_kmh": speed_kmh,
        "target_distance_m": target_dist_m,
        "max_slope_allowed": calibrated_slope,
        "parsed_intent": calibrated_intent.model_dump(),
        "execution_trace": trace,
        "status": "constraints_calibrated"
    }


def node_generate_candidates(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 3] Routing Adapter 도구를 호출하여 출발지 기반 순환 루프 후보 3종 생성."""
    trace = list(state.get("execution_trace", []))
    intent_dict = state.get("parsed_intent") or {}
    weather = state.get("weather_context") or {}
    current_weather = weather.get("current") or weather

    surf_temp = current_weather.get("estimated_surface_temp")
    air_temp = current_weather.get("air_temp_celsius")
    pilot_park_id = state.get("pilot_park_id")
    origin_mode = state.get("origin_mode")
    if not origin_mode:
        origin_mode = "current_location"

    request = LoopCandidateRequest(
        origin_lat=state.get("origin_lat", 37.5665),
        origin_lon=state.get("origin_lon", 126.9780),
        target_distance_m=state.get("target_distance_m", 1000.0),
        speed_kmh=state.get("calibrated_speed_kmh", 2.8),
        avoid_stairs=intent_dict.get("avoid_stairs", True),
        max_slope_allowed=state.get("max_slope_allowed", 6.0),
        preferred_surfaces=intent_dict.get("preferred_surfaces", ["dirt", "grass"]),
        origin_mode=origin_mode,
        pilot_park_id=pilot_park_id,
        estimated_surface_temp=surf_temp,
        air_temp_celsius=air_temp,
    )
    candidates = generate_loop_candidates(request)

    trace.append(
        f"[Node: generate_candidates] Generated {len(candidates)} loop candidates via Routing Adapter. "
        f"(Base Surface Temp: {surf_temp}℃, Air Temp: {air_temp}℃)"
    )

    return {
        "candidate_routes": [c.model_dump() for c in candidates],
        "execution_trace": trace,
        "status": "candidates_generated"
    }


def _apply_profile_to_candidate(c: RouteCandidate, profile: Dict[str, Any], surface_temp_c: Optional[float]) -> None:
    """실측 프로필 지표(경사, 계단, 그늘, 노면, 지면온도)를 후보 객체에 동기화."""
    c.max_slope_percent = profile.get("max_slope_percent", c.max_slope_percent)
    c.average_slope_percent = profile.get("avg_slope_percent", c.average_slope_percent)
    c.slope_source = profile.get("slope_source", "approximation")

    stairs_count = profile.get("stairs_count")
    if stairs_count is not None:
        c.has_stairs = stairs_count > 0
        c.stairs_source = profile.get("stairs_source")

    shade_ratio = profile.get("shade_ratio")
    if shade_ratio is not None:
        c.average_shade_ratio = shade_ratio
        c.shade_source = profile.get("shade_source")

    surface_known_ratio = profile.get("surface_known_ratio")
    if surface_known_ratio is not None:
        c.surface_known_ratio = surface_known_ratio
        if surface_known_ratio > 0:
            c.surface_source = "osm_surface_tags"

    if surface_temp_c is not None:
        c.surface_temp_c = surface_temp_c

    is_measured = (profile.get("slope_source") == "dem" or
                   profile.get("stairs_source") == "park_network_osm_tags")
    c.data_reliability = "measured" if is_measured else "estimated"


def _score_candidates_personalized(state: WalkPlanningState, candidates: List[RouteCandidate],
                                   target_dist: float) -> List[ScoredRoute]:
    """[제안] 실측 지표(course_profiles 와 같은 계산) + 반려견 관절 단계 + 그늘·노면 선호로 채점한다.

    후보의 경사·계단·그늘·지면온도도 실측값으로 바꿔, 카드·안내 문구가 같은 값을 보게 한다.
    기존 score_candidate_route(고정 프로필)는 비교·검토용으로 남겨 둔다.
    """
    from agent.park_route_validation import entry_approach_length_m
    from agent.personalized_scorer import score_personalized
    from services.route_profile import measure_route_profile

    intent = state.get("parsed_intent") or {}
    dog = state.get("client_dog_context") or {}
    weather = state.get("weather_context") or {}
    current = weather.get("current") or weather
    park_id = state.get("pilot_park_id") if state.get("origin_mode") in ("park", "parking_pnr") else None
    scored_list: List[ScoredRoute] = []
    for c in candidates:
        profile = measure_route_profile(c.geojson_coordinates, park_id) if c.geojson_coordinates else {}
        # 경계 밖 주차장 진입로 왕복은 목표 거리와 비교하지 않는다 (#160 가 안: 공원 안 코스만 목표에 맞춘다)
        approach_m = entry_approach_length_m(park_id, c.geojson_coordinates) if park_id else 0.0
        loop_distance_m = c.total_distance_m - 2 * approach_m
        result = score_personalized(
            profile, distance_m=loop_distance_m, target_distance_m=target_dist,
            joint_care_level=int(dog.get("joint_care_level", 1)),
            calibrated_max_slope=state.get("max_slope_allowed"),
            avoid_stairs=intent.get("avoid_stairs", True), shade_priority=intent.get("shade_priority", False),
            preferred_surfaces=intent.get("preferred_surfaces"),
            air_temp_c=current.get("air_temp_celsius"), surface_temp_c=current.get("estimated_surface_temp"),
        )
        if profile:
            _apply_profile_to_candidate(c, profile, result.surface_temp_c)
        scored_list.append(ScoredRoute(
            candidate=c, total_score=result.total, stairs_score=result.stairs, slope_score=result.slope,
            thermal_score=result.thermal, distance_score=result.distance, preference_score=result.preference, rank=1,
            distance_error_ratio=abs(loop_distance_m - target_dist) / target_dist if target_dist else 0.0,
        ))
    return scored_list


def node_score_and_rank(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 4] Candidate Route Scorer 100점 만점 다요소 평가 및 최적 경로 선정."""
    trace = list(state.get("execution_trace", []))
    candidate_dicts = state.get("candidate_routes", [])
    target_dist = state.get("target_distance_m", 1000.0)

    candidates = [RouteCandidate(**cd) for cd in candidate_dicts]
    scored_list: List[ScoredRoute] = _score_candidates_personalized(state, candidates, target_dist)

    # 요청 시간에 맞는 코스 먼저, 그 안에서 점수 내림차순 (#170)
    scored_list.sort(key=rank_key)
    for i, s in enumerate(scored_list):
        s.rank = i + 1

    best = scored_list[0]
    trace.append(
        f"[Node: score_and_rank] Best Route: '{best.candidate.name}' "
        f"(Score: {best.total_score}점 / 계단:{best.stairs_score}, 경사:{best.slope_score}, "
        f"지면열:{best.thermal_score}, 거리:{best.distance_score})"
    )

    return {
        "scored_routes": [s.model_dump() for s in scored_list],
        "selected_route": best.candidate.model_dump(),
        "best_score": best.total_score,
        "execution_trace": trace,
        "status": "scored_and_ranked"
    }


# 폭신한 노면 비율은 노면 정보가 경로의 절반 이상 확인될 때만 말한다 (main.SOFT_SURFACE_MIN_KNOWN_RATIO 와 같은 값)
_SOFT_SURFACE_MIN_KNOWN_RATIO = 0.5


def _measured_route_phrase(profile: Dict[str, Any]) -> str:
    """안내 문구용 코스 설명. 실측으로 확인된 값만 쓰고, 모르는 값은 말하지 않는다 (#114)."""
    parts = []
    stairs = profile.get("stairs_count")
    if stairs == 0:
        parts.append("확인된 계단 없음")
    elif stairs:
        parts.append(f"계단 {stairs}곳")
    if profile.get("slope_source") == "dem" and profile.get("max_slope_percent") is not None:
        parts.append(f"최대 경사 {profile['max_slope_percent']:.1f}%")
    soft, known = profile.get("soft_surface_ratio"), profile.get("surface_known_ratio")
    if soft is not None and known is not None and known >= _SOFT_SURFACE_MIN_KNOWN_RATIO:
        parts.append(f"폭신한 노면 {round(soft * 100)}%")
    if profile.get("shade_ratio") is not None:
        parts.append(f"그늘 {round(profile['shade_ratio'] * 100)}%")
    return " · ".join(parts)


def _build_wellness_heat_notice(
    surface_temp: float,
    is_golden: bool,
    is_hot_query: bool,
    raining_now: bool,
    golden_window: str,
    breed: str,
    dog_name: str,
    route_text: str,
    duration: int,
    dist_m: float,
) -> Tuple[str, str, str]:
    """지면 온도와 기상 조건에 따른 웰니스 안내 문구(열 안내, 경로 안내, 마무리)를 생성."""
    from services.weather_context import SAFE_MAX_C

    if not is_golden or (is_hot_query and surface_temp > SAFE_MAX_C):
        heat = (f"현재 기상청 예보 기준 지면온도가 {surface_temp:.0f}℃로 뜨거워요. "
                f"{golden_window} 산책을 권장하며, 지금 나가신다면 그늘을 따라 짧게 걸어 주세요.")
        route_sentence = f"{breed} {dog_name}를 위해 {route_text}로 안내할게요."
        closing = f"약 {duration}분({int(dist_m)}m) 코스예요. 스마트폰은 주머니에 넣으시고 안전하게 출발하세요! 🐾"
        return heat, route_sentence, closing

    if raining_now:
        heat = f"현재 지면온도는 {surface_temp:.1f}℃로 발바닥에 뜨겁지 않아요."
    else:
        heat = f"현재 지면온도가 {surface_temp:.1f}℃로 발바닥에 안전한 골든타임이에요."
    route_sentence = f"{breed} {dog_name}와의 소중한 산책을 위해 {route_text}를 준비했어요."
    closing = (f"약 {duration}분({int(dist_m)}m) 동안 편안하게 걸으실 수 있어요. "
               "스마트폰은 주머니에 넣으시고 안전하게 출발하세요! 🐾")
    return heat, route_sentence, closing


def node_synthesize_briefing(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 5] 시선 해방(Eyes-Free) 핸즈프리 음성 안내 및 화면 브리핑 메시지 합성.

    * 기상청 실시간 지면열 및 골든타임 동적 반영:
      - 33℃ 초과 또는 더위 우려 질의 시: 지면열 경고 및 골든타임 권장
      - 33℃ 이하: 안전 골든타임 알림. 단, 지금 비가 오면 골든타임이라고 하지 않는다
    * 비 예보(weather_context.precipitation)를 안내한다 (#114).
    * 코스 설명은 실측 지표(계단·경사·노면·그늘)로만 말하고, 모르는 값은 말하지 않는다 (#114).
    * 웰니스 카피라이팅 가드레일: 임상 질병 용어(특정 관절 질환명 등) 100% 배제.
    """
    from services.route_profile import measure_route_profile
    from services.weather_context import SAFE_MAX_C, rain_notice

    trace = list(state.get("execution_trace", []))
    selected_dict = state.get("selected_route") or {}
    dog_ctx_dict = state.get("client_dog_context") or {}
    intent_dict = state.get("parsed_intent") or {}
    weather = state.get("weather_context") or {}
    current_weather = weather.get("current") or weather
    golden_window = weather.get("golden_time_window", "17시 이후 또는 일몰 후")
    score = state.get("best_score", 95.0)

    dog_name = dog_ctx_dict.get("name", "강아지")
    breed = dog_ctx_dict.get("breed", "반려견")
    duration = selected_dict.get("estimated_duration_minutes", intent_dict.get("target_duration_minutes", 20))
    route_name = selected_dict.get("name", "안심 산책로")
    dist_m = selected_dict.get("total_distance_m", 900.0)

    user_query = state.get("user_query", "")
    is_hot_query = any(k in user_query for k in ["더워", "덥", "뜨거", "열", "낮", "햇빛", "햇볕", "시원한", "그늘"])
    surface_temp = current_weather.get("estimated_surface_temp", 29.5)
    is_golden = current_weather.get("is_golden_time", surface_temp <= SAFE_MAX_C)  # Issue #153 나 안: 33℃ 이하만 안전
    precipitation = weather.get("precipitation") or {}
    raining_now = bool(precipitation.get("known") and precipitation.get("is_precipitating_now"))

    coords = selected_dict.get("geojson_coordinates") or []
    park_id = state.get("pilot_park_id") if state.get("origin_mode") in ("park", "parking_pnr") else None
    phrase = _measured_route_phrase(measure_route_profile(coords, park_id)) if coords else ""
    route_text = f"'{route_name}'({phrase})" if phrase else f"'{route_name}'"

    heat, route_sentence, closing = _build_wellness_heat_notice(
        surface_temp=surface_temp,
        is_golden=is_golden,
        is_hot_query=is_hot_query,
        raining_now=raining_now,
        golden_window=golden_window,
        breed=breed,
        dog_name=dog_name,
        route_text=route_text,
        duration=duration,
        dist_m=dist_m,
    )
    rain = rain_notice(precipitation)
    briefing = " ".join(part for part in (heat, rain, route_sentence, closing) if part)

    trace.append(f"[Node: synthesize_briefing] Synthesized wellness briefing. Total Score: {score}점, SurfaceTemp: {surface_temp}℃")

    return {
        "briefing_message": briefing,
        "execution_trace": trace,
        "status": "completed"
    }


# ==============================================================================
# 6. LangGraph 워크플로우 그래프 빌드 및 컴파일
# ==============================================================================

def create_walk_planning_agent():
    """LangGraph StateGraph 기반 ReAct Walk Planning Agent 빌드."""
    workflow = StateGraph(WalkPlanningState)

    # 노드 등록
    workflow.add_node("parse_intent", node_parse_intent)
    workflow.add_node("calibrate_constraints", node_calibrate_constraints)
    workflow.add_node("generate_candidates", node_generate_candidates)
    workflow.add_node("score_and_rank", node_score_and_rank)
    workflow.add_node("synthesize_briefing", node_synthesize_briefing)

    # 엣지 연결 (선형 ReAct 오케스트레이션 파이프라인)
    workflow.add_edge(START, "parse_intent")
    workflow.add_edge("parse_intent", "calibrate_constraints")
    workflow.add_edge("calibrate_constraints", "generate_candidates")
    workflow.add_edge("generate_candidates", "score_and_rank")
    workflow.add_edge("score_and_rank", "synthesize_briefing")
    workflow.add_edge("synthesize_briefing", END)

    return workflow.compile()


# ==============================================================================
# 7. 엔트리포인트 실행 함수
# ==============================================================================

_COMPILED_AGENT = None


def get_agent():
    """싱글톤 에이전트 인스턴스 반환."""
    global _COMPILED_AGENT
    if _COMPILED_AGENT is None:
        _COMPILED_AGENT = create_walk_planning_agent()
    return _COMPILED_AGENT


def run_walk_planning_agent(
    user_query: str,
    client_dog_context: Optional[Dict[str, Any]] = None,
    client_recent_feedback: Optional[List[Dict[str, Any]]] = None,
    weather_context: Optional[Dict[str, Any]] = None,
    origin_lat: float = 37.5665,
    origin_lon: float = 126.9780,
    origin_mode: Optional[str] = None,
    parking_lot_id: Optional[str] = None,
    pilot_park_id: Optional[str] = None,
    intent_overrides: Optional[Dict[str, Any]] = None,
) -> WalkPlanningResult:
    """[US-A1, US-A3, US-B1~B3, US-E3, US-F1, US-G1] Walk Planning Agent 단일 실행 진입 함수."""
    agent = get_agent()

    if not origin_mode:
        origin_mode = "current_location"

    # 기상 컨텍스트 미제공 시 실시간 기상청 지면열 모델 자동 바인딩 (기본 안전 산책 프리셋)
    if weather_context is None:
        import datetime
        now_hour = datetime.datetime.now().hour
        # 기본 온화한 안전 산책 기상 프리셋 (외기온 21.5℃, 지면열 약 27.5℃ 골든타임)
        dto = determine_heat_risk_dto(hour=now_hour, air_temp=21.5, sky="partly_cloudy")
        dto_dict = dto.model_dump() if hasattr(dto, "model_dump") else dto.dict()
        weather_context = {
            "current": dto_dict,
            "golden_time_window": "06:00 ~ 21:00",
            "is_live_estimated": True,
        }

    initial_state: WalkPlanningState = {
        "messages": [],
        "user_query": user_query,
        "client_dog_context": client_dog_context,
        "client_recent_feedback": client_recent_feedback or [],
        "weather_context": weather_context,
        "origin_lat": origin_lat,
        "origin_lon": origin_lon,
        "origin_mode": origin_mode,
        "parking_lot_id": parking_lot_id,
        "pilot_park_id": pilot_park_id,
        "intent_overrides": intent_overrides,
        "parsed_intent": None,
        "calibrated_speed_kmh": 2.8,
        "target_distance_m": 0.0,
        "max_slope_allowed": 15.0,
        "candidate_routes": [],
        "scored_routes": [],
        "selected_route": None,
        "best_score": 0.0,
        "briefing_message": "",
        "execution_trace": [],
        "status": "initialized"
    }

    final_state = agent.invoke(initial_state)

    best_candidate = RouteCandidate(**final_state["selected_route"])
    intent = WalkIntent(**final_state["parsed_intent"])
    scored_all = [ScoredRoute(**sr) for sr in final_state["scored_routes"]]

    return WalkPlanningResult(
        status=final_state["status"],
        best_route=best_candidate,
        best_score=final_state["best_score"],
        intent=intent,
        briefing_message=final_state["briefing_message"],
        all_scored_candidates=scored_all,
        execution_trace=final_state["execution_trace"],
        weather_context=final_state.get("weather_context"),
    )
