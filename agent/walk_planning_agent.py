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

# ==============================================================================
# 1. Pydantic 스키마 정의 (Strict Data Contracts)
# ==============================================================================

AllowedSurface = Literal["grass", "dirt", "rubber", "paved", "asphalt", "gravel"]
SlopePreference = Literal["gentle", "very_gentle", "steep_avoid", "none"]


class ClientDogContext(BaseModel):
    """클라이언트 로컬(AsyncStorage)에서 무상태로 동봉하는 반려견 프로필 DTO."""
    dog_id: str = Field(default="dog-001", min_length=1)
    name: str = Field(default="아이", min_length=1)
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
    target_duration_minutes: int = Field(default=25, ge=10, le=90)
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


class ScoredRoute(BaseModel):
    """Candidate Route Scorer 채점 결과 모델."""
    candidate: RouteCandidate
    total_score: float
    stairs_score: float
    slope_score: float
    thermal_score: float
    distance_score: float
    rank: int


class WalkPlanningResult(BaseModel):
    """에이전트 최종 오케스트레이션 반환 결과."""
    status: str
    best_route: RouteCandidate
    best_score: float
    intent: WalkIntent
    briefing_message: str
    all_scored_candidates: List[ScoredRoute]
    execution_trace: List[str]


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
    """자연어 발화에서 목표 산책 시간(분) 추출 (10~90분 클램핑)."""
    # 1. 1시간 반, 한시간 30분 등 복합 표현
    if re.search(r"(?:1\s*시간|한\s*시간)\s*(?:반|30\s*분)", query_str):
        return 90
    # 2. 1시간, 한시간 등 60분 표현
    if re.search(r"(?:1\s*시간|한\s*시간|한시간)", query_str):
        return 60
    # 3. 반시간 (30분)
    if "반시간" in query_str:
        return 30
    # 4. 숫자 + 분/min 정규식
    match = re.search(r"(\d{1,3})\s*(?:분|min)", query_str)
    if match:
        dur = int(match.group(1))
        return max(10, min(90, dur))
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
        "더워", "낮", "햇빛", "햇볕", "흙", "잔디", "탄성", "우레탄",
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

    if any(w in query_str for w in ["그늘", "시원한", "더워", "낮", "햇빛", "햇볕"]):
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


def score_candidate_route(candidate: RouteCandidate, target_distance_m: float) -> ScoredRoute:
    """[US-B3] Candidate Route Scorer: 후보 경로 다요소 종합 100점 채점기.
    
    1. 계단 배제 (30점): 계단 없으면 30점, 있으면 0점
    2. 경사도 적합도 (30점): max_slope <= 5% 30점, <= 8% 20점, > 8% 10점
    3. 지면온도/열안전 (20점): surface_temp <= 32℃ 20점, <= 36℃ 15점, <= 40℃ 8점
    4. 거리 적합도 (20점): 목표 거리 대비 오차율 기반 감점
    """
    # 1. 계단 배제
    stairs_score = 0.0 if candidate.has_stairs else 30.0

    # 2. 경사도 점수
    max_slope = candidate.max_slope_percent
    if max_slope <= 5.0:
        slope_score = 30.0
    elif max_slope <= 8.0:
        slope_score = 20.0
    else:
        slope_score = 10.0

    # 3. 지면온도 / 열안전
    temp = candidate.surface_temp_c
    if temp <= 32.0:
        thermal_score = 20.0
    elif temp <= 36.0:
        thermal_score = 15.0
    elif temp <= 40.0:
        thermal_score = 8.0
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
        rank=1
    )


from agent.road_network_routes import (
    V1_ROAD_ALIGNED_COORDS,
    V2_ROAD_ALIGNED_COORDS,
    V3_ROAD_ALIGNED_COORDS,
    V1_ROAD_STEPS,
    V2_ROAD_STEPS,
    V3_ROAD_STEPS,
    fetch_osrm_foot_route,
)


SEOUL_VARIANT_CONFIG: Dict[int, Dict[str, Any]] = {
    1: {
        "waypoints": [
            (37.5663, 126.9784),
            (37.56625, 126.97914),
            (37.5675, 126.9792),
            (37.5689, 126.9794),
            (37.5691, 126.9806),
            (37.5689, 126.9830),
            (37.5661, 126.9828),
            (37.5663, 126.9784),
        ],
        "steps": V1_ROAD_STEPS,
        "fallback": V1_ROAD_ALIGNED_COORDS,
    },
    2: {
        "waypoints": [
            (37.5663, 126.9784),
            (37.5680, 126.9774),
            (37.5693, 126.9772),
            (37.5693, 126.9800),
            (37.5689, 126.9830),
            (37.5694, 126.9830),
            (37.5696, 126.9795),
            (37.5693, 126.9772),
            (37.5680, 126.9774),
            (37.5663, 126.9784),
        ],
        "steps": V2_ROAD_STEPS,
        "fallback": V2_ROAD_ALIGNED_COORDS,
    },
    3: {
        "waypoints": [
            (37.5663, 126.9784),
            (37.5658, 126.9765),
            (37.5660, 126.9754),
            (37.5677, 126.9738),
            (37.5697, 126.9715),
            (37.5701, 126.9732),
            (37.5686, 126.9768),
            (37.5663, 126.9784),
        ],
        "steps": V3_ROAD_STEPS,
        "fallback": V3_ROAD_ALIGNED_COORDS,
    },
}

GENERAL_GRID_DELTAS: Dict[int, Tuple[float, float]] = {
    1: (0.0022, 0.0028),
    2: (0.0018, 0.0022),
}


def _generate_seoul_center_loop(variant: int) -> tuple[List[List[float]], List[Dict[str, Any]]]:
    """서울 도심 권역 실시간 OSRM 또는 고정밀 보행 도로망 노드 루프 반환."""
    cfg = SEOUL_VARIANT_CONFIG.get(variant, SEOUL_VARIANT_CONFIG[3])
    live_res = fetch_osrm_foot_route(cfg["waypoints"], timeout_seconds=1.5)
    if live_res and len(live_res[0]) >= 10:
        return live_res[0], cfg["steps"]
    return cfg["fallback"], cfg["steps"]


def _generate_general_grid_loop(
    origin_lat: float,
    origin_lon: float,
    variant: int,
) -> tuple[List[List[float]], List[Dict[str, Any]]]:
    """일반 좌표 권역 실시간 OSRM 또는 L자 격자 도로망 루프 반환."""
    d_lat, d_lon = GENERAL_GRID_DELTAS.get(variant, (0.0026, 0.0032))

    live_res = fetch_osrm_foot_route([
        (origin_lat, origin_lon),
        (origin_lat + d_lat, origin_lon),
        (origin_lat + d_lat, origin_lon + d_lon),
        (origin_lat, origin_lon + d_lon),
        (origin_lat, origin_lon),
    ], timeout_seconds=1.2)
    if live_res and len(live_res[0]) >= 8:
        coords = live_res[0]
        dist = live_res[1]
        steps = [
            {"instruction": "보행로를 따라 직진하세요.", "distance_m": int(dist * 0.25), "position": coords[len(coords) // 4]},
            {"instruction": "교차로에서 우회전하여 가로수길로 진입하세요.", "distance_m": int(dist * 0.5), "position": coords[len(coords) // 2]},
            {"instruction": "출발 방향으로 우회전하여 복귀하세요.", "distance_m": int(dist * 0.75), "position": coords[(3 * len(coords)) // 4]},
        ]
        return coords, steps

    n_pts_per_edge = 4
    edge1 = [[origin_lon, origin_lat + d_lat * (i / n_pts_per_edge)] for i in range(n_pts_per_edge)]
    edge2 = [[origin_lon + d_lon * (i / n_pts_per_edge), origin_lat + d_lat] for i in range(n_pts_per_edge)]
    edge3 = [[origin_lon + d_lon, origin_lat + d_lat * (1.0 - i / n_pts_per_edge)] for i in range(n_pts_per_edge)]
    edge4 = [[origin_lon + d_lon * (1.0 - i / n_pts_per_edge), origin_lat] for i in range(n_pts_per_edge)]
    coords = edge1 + edge2 + edge3 + edge4 + [[origin_lon, origin_lat]]

    steps = [
        {"instruction": "보행로를 따라 직진하세요.", "distance_m": 200, "position": coords[len(coords) // 4]},
        {"instruction": "교차로에서 우회전하여 가로수길로 진입하세요.", "distance_m": 300, "position": coords[len(coords) // 2]},
        {"instruction": "횡단보도 건너 출발 방향으로 우회전하세요.", "distance_m": 250, "position": coords[(3 * len(coords)) // 4]},
    ]
    return coords, steps


def _generate_road_aligned_loop(
    origin_lat: float,
    origin_lon: float,
    variant: int,
) -> tuple[List[List[float]], List[Dict[str, Any]]]:
    """도로나 인도를 벗어나지 않고 실제 보행 가능한 도로망을 따르는 순환 코스 좌표열 및 스텝 생성."""
    if abs(origin_lat - 37.5665) < 0.05 and abs(origin_lon - 126.9780) < 0.05:
        return _generate_seoul_center_loop(variant)
    return _generate_general_grid_loop(origin_lat, origin_lon, variant)


def mock_generate_loop_candidates(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    target_duration_minutes: float,
    avoid_stairs: bool,
    max_slope_allowed: float,
    preferred_surfaces: List[str]
) -> List[RouteCandidate]:
    """[US-A3, US-B1] Routing API Adapter 실제 도로망 추종 순환 루프 후보 3종 생성기."""
    c1_coords, c1_steps = _generate_road_aligned_loop(origin_lat, origin_lon, variant=1)
    c2_coords, c2_steps = _generate_road_aligned_loop(origin_lat, origin_lon, variant=2)
    c3_coords, c3_steps = _generate_road_aligned_loop(origin_lat, origin_lon, variant=3)

    # 후보 1: 최적 무장애 흙길·수변 그늘길 루프 (모전교~광통교~광교~을지로1가)
    c1 = RouteCandidate(
        route_id="candidate-loop-01",
        name="🌿 청계천 수변 그늘길 & 무교로 보행안심 순환로",
        total_distance_m=round(target_distance_m * 1.02, 1),
        estimated_duration_minutes=round(target_duration_minutes * 1.02, 1),
        has_stairs=False,
        max_slope_percent=min(4.2, max_slope_allowed),
        average_slope_percent=2.3,
        surface_temp_c=28.5,
        average_shade_ratio=0.85,
        surface_types=preferred_surfaces if preferred_surfaces else ["dirt", "grass"],
        geojson_coordinates=c1_coords,
        turn_by_turn_steps=c1_steps
    )

    # 후보 2: 완만 보도 및 탄성포장 안심길 (청계천 양안 수변 보행 데크)
    c2 = RouteCandidate(
        route_id="candidate-loop-02",
        name="🚶 청계천 양안 수변 보행데크 순환 코스",
        total_distance_m=round(target_distance_m * 0.94, 1),
        estimated_duration_minutes=round(target_duration_minutes * 0.94, 1),
        has_stairs=False,
        max_slope_percent=min(6.5, max_slope_allowed + 1.0),
        average_slope_percent=3.4,
        surface_temp_c=31.2,
        average_shade_ratio=0.60,
        surface_types=["rubber", "paved"],
        geojson_coordinates=c2_coords,
        turn_by_turn_steps=c2_steps
    )

    # 후보 3: 문화유산 보행 전용길 루프 (덕수궁 돌담길 & 정동길)
    c3 = RouteCandidate(
        route_id="candidate-loop-03",
        name="🏢 덕수궁 돌담길 & 정동길 문화 산책 코스",
        total_distance_m=round(target_distance_m * 1.15, 1),
        estimated_duration_minutes=round(target_duration_minutes * 1.15, 1),
        has_stairs=not avoid_stairs,
        max_slope_percent=8.5,
        average_slope_percent=4.8,
        surface_temp_c=35.5,
        average_shade_ratio=0.35,
        surface_types=["asphalt", "paved"],
        geojson_coordinates=c3_coords,
        turn_by_turn_steps=c3_steps
    )

    return [c1, c2, c3]


# ==============================================================================
# 4. LangGraph State 정의 (WalkPlanningState)
# ==============================================================================

class WalkPlanningState(TypedDict):
    """LangGraph StateGraph 오케스트레이션 상태 사전."""
    messages: Annotated[List[Dict[str, Any]], add_messages]
    user_query: str
    client_dog_context: Optional[Dict[str, Any]]
    client_recent_feedback: List[Dict[str, Any]]
    origin_lat: float
    origin_lon: float
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

def node_parse_intent(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 1] 사용자의 자연어 발화에서 의도를 파싱하고 Pydantic 스키마로 검증."""
    query = state.get("user_query", "")
    trace = list(state.get("execution_trace", []))
    trace.append(f"[Node: parse_intent] User query: '{query}'")

    intent = parse_natural_language_walk_query(query)
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

    # 속도 계산 (소형 2.8, 중형 3.6, 대형 4.2, 노령 2.2 km/h)
    speed_kmh = get_standard_speed_kmh(dog_ctx.weight_kg, dog_ctx.age_years, dog_ctx.joint_care_level)

    intent_dict = state.get("parsed_intent") or {}
    duration_min = intent_dict.get("target_duration_minutes", 20)

    # 목표 거리 환산 (D = V * T)
    target_dist_m = round((speed_kmh * 1000.0 / 60.0) * duration_min, 1)

    # 경사도 보정 (기본 15도 미만, 피드백 too_steep 시 하향)
    base_slope = 7.0 if intent_dict.get("slope_preference") == "gentle" else 12.0
    calibrated_slope = calibrate_max_slope_with_feedback(base_slope, feedback_list)

    trace.append(
        f"[Node: calibrate_constraints] Dog: {dog_ctx.breed} ({dog_ctx.age_years}세, {dog_ctx.weight_kg}kg) -> "
        f"Speed: {speed_kmh}km/h, TargetDist: {target_dist_m}m, MaxSlope: {calibrated_slope}%"
    )

    return {
        "calibrated_speed_kmh": speed_kmh,
        "target_distance_m": target_dist_m,
        "max_slope_allowed": calibrated_slope,
        "execution_trace": trace,
        "status": "constraints_calibrated"
    }


def node_generate_candidates(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 3] Routing Adapter 도구를 호출하여 순환 루프 후보 3종 생성."""
    trace = list(state.get("execution_trace", []))
    origin_lat = state.get("origin_lat", 37.5665)
    origin_lon = state.get("origin_lon", 126.9780)
    target_dist = state.get("target_distance_m", 1000.0)
    intent_dict = state.get("parsed_intent") or {}
    duration_min = intent_dict.get("target_duration_minutes", 20)
    avoid_stairs = intent_dict.get("avoid_stairs", True)
    max_slope = state.get("max_slope_allowed", 6.0)
    preferred_surfaces = intent_dict.get("preferred_surfaces", ["dirt", "grass"])

    candidates = mock_generate_loop_candidates(
        origin_lat=origin_lat,
        origin_lon=origin_lon,
        target_distance_m=target_dist,
        target_duration_minutes=duration_min,
        avoid_stairs=avoid_stairs,
        max_slope_allowed=max_slope,
        preferred_surfaces=preferred_surfaces
    )

    trace.append(f"[Node: generate_candidates] Generated {len(candidates)} loop candidates via Routing Adapter.")

    return {
        "candidate_routes": [c.model_dump() for c in candidates],
        "execution_trace": trace,
        "status": "candidates_generated"
    }


def node_score_and_rank(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 4] Candidate Route Scorer 100점 만점 다요소 평가 및 최적 경로 선정."""
    trace = list(state.get("execution_trace", []))
    candidate_dicts = state.get("candidate_routes", [])
    target_dist = state.get("target_distance_m", 1000.0)

    candidates = [RouteCandidate(**cd) for cd in candidate_dicts]
    scored_list: List[ScoredRoute] = []

    for c in candidates:
        scored = score_candidate_route(c, target_dist)
        scored_list.append(scored)

    # 점수 내림차순 정렬
    scored_list.sort(key=lambda s: s.total_score, reverse=True)
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


def node_synthesize_briefing(state: WalkPlanningState) -> Dict[str, Any]:
    """[Node 5] 시선 해방(Eyes-Free) 핸즈프리 음성 안내 및 화면 브리핑 메시지 합성.
    
    * 웰니스 카피라이팅 가드레일: 임상 질병 용어(슬개골 탈구, 관절염 등) 100% 배제.
    """
    trace = list(state.get("execution_trace", []))
    selected_dict = state.get("selected_route") or {}
    dog_ctx_dict = state.get("client_dog_context") or {}
    intent_dict = state.get("parsed_intent") or {}
    score = state.get("best_score", 95.0)

    dog_name = dog_ctx_dict.get("name", "아이")
    breed = dog_ctx_dict.get("breed", "반려견")
    duration = intent_dict.get("target_duration_minutes", 20)
    route_name = selected_dict.get("name", "안심 산책로")
    dist_m = selected_dict.get("total_distance_m", 900.0)

    # 긍정적 웰니스 카피라이팅
    briefing = (
        f"{breed} {dog_name}와의 소중한 산책을 위해 '{route_name}'를 준비했어요. "
        f"계단 걱정 없이 경사가 완만한 폭신한 길 위주로 구성되어 약 {duration}분({int(dist_m)}m) 동안 "
        f"발이 편안하게 걸으실 수 있어요. 스마트폰은 주머니에 넣으시고 안전하게 출발하세요! 🐾"
    )

    trace.append(f"[Node: synthesize_briefing] Synthesized wellness briefing. Total Score: {score}점")

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
    origin_lat: float = 37.5665,
    origin_lon: float = 126.9780
) -> WalkPlanningResult:
    """[US-A1, US-A3, US-B1~B3, US-E3] Walk Planning Agent 단일 실행 진입 함수."""
    agent = get_agent()

    initial_state: WalkPlanningState = {
        "messages": [],
        "user_query": user_query,
        "client_dog_context": client_dog_context,
        "client_recent_feedback": client_recent_feedback or [],
        "origin_lat": origin_lat,
        "origin_lon": origin_lon,
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
        execution_trace=final_state["execution_trace"]
    )
