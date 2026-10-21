"""[편안하개 - PetWalk]
FastAPI 메인 애플리케이션 엔트리포인트 (v1 REST API).

- CORS 설정 (Expo Web http://localhost:8081 및 모바일 클라이언트 지원)
- POST /api/v1/walk/plan (LangGraph ReAct Walk Planning Agent 코어 연동)
- POST /api/v1/walk/reroute (US-D2 현장 위험 감지 시 안전 우회 재탐색)
- POST /api/v1/surface/inspect (US-D1 현장 위험물/공원안내판 사진 판독 입구)
- POST /api/v1/community/share (US-G2 200m 공간 마스킹 코스 공유)
- GET /api/v1/community/feed (공개 안심 코스 피드)
- POST /api/v1/hazards, GET /api/v1/hazards (공공 위험 제보 적재/반경 조회)
- GET /health (헬스체크)
"""

import os
import json
import logging
import math
import time
from uuid import uuid4

from dotenv import load_dotenv

# .env 를 가장 먼저 읽어야 agent.* 모듈 import 시 os.getenv(SUPABASE_URL 등) 가 값을 본다.
load_dotenv()

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from uuid import UUID
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Tuple

from agent.walk_planning_agent import run_walk_planning_agent
from agent.pilot_park_routes import PILOT_PARK_CENTERS, resolve_pilot_park_key
from agent.park_route_validation import RoutePlanningError, validate_park_route
from agent.route_steps import build_turn_steps
from agent.road_network_routes import V1_ROAD_ALIGNED_COORDS, osrm_status
from agent.walk_limits import MAX_WALK_MINUTES, MIN_WALK_MINUTES
from agent.supabase_repository import community_repo
from services.route_warmup import mark_activity, start_background_warmup
from services.walk_share import WalkShareError, share_walk, unshare_walk, verify_user
from agent.hazard_service import (
    HazardReportRepository,
    HazardReportRequest,
    InspectType,
    RerouteRequest,
    reroute_around_hazard,
    run_vision_inspection,
)
from agent.surface_slope_evaluator import build_segmented_geojson
from services import open_meteo_client
from services.dem import elevation_source
from services.route_profile import measure_route_profile
from services.kma_weather_client import KmaApiError, to_kst
from services.parking_lots import find_nearby_parking_lots, load_pilot_parking_lots
from services.weather_context import (
    CAUTION_MAX_C,
    NO_SUN_SURFACE_OFFSET_C,
    SAFE_MAX_C,
    SURFACE_HEAT_GAIN_MAP,
    build_heat_risk_response,
    estimate_surface_temp,
    build_open_meteo_heat_risk_response,
    rain_notice,
    weather_context_from_response,
)
from test_case.test_api_contracts import (
    apply_spatial_masking_to_course,
    WalkPlanResponseV1,
    CommunityCourseShareRequest,
    CommunityCourseSummary,
)
from test_case.test_thermal_and_parking import determine_heat_risk_dto
from services.voice_intent_service import (
    VoiceWalkIntentPayload,
    parse_voice_walk_intent,
    resolve_landmark_park_id,
)

from contextlib import asynccontextmanager


def _warm_up_route_caches() -> None:
    """[#125] 서버가 켜지면 공원 그래프·구간 고도를 백그라운드에서 미리 계산한다. (헬스체크는 막지 않는다)"""
    start_background_warmup(
        weather_fetch=_live_heat_risk_response,
        weather_points=[(lat, lon) for lat, lon, _name in PILOT_PARK_CENTERS.values()],
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """[#125] 서버 수명 주기(lifespan): 백그라운드 캐시 워밍업 실행"""
    _warm_up_route_caches()
    yield


app = FastAPI(
    title="편안하개 (PetWalk) API",
    description="AI Native 반려견 맞춤형 안심 노면 산책 에이전트 및 핸즈프리 모바일 플랫폼 REST API",
    version="1.0.0",
    lifespan=lifespan,
)
logger = logging.getLogger(__name__)

# 🌐 크로스 오리진(CORS) 미들웨어 설정 (Expo Web 및 모바일 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",  # 모든 도메인(온라인/로컬/배포 URL) 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 위험 제보 저장소: community_repo 의 Supabase 클라이언트를 공유 (미연결 시 인메모리)
hazard_repo = HazardReportRepository(lambda: community_repo._client)

_MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8MB


@app.get("/")
def read_root():
    return {
        "service": "편안하개 (PetWalk) Core API",
        "status": "online",
        "version": "1.0.0",
        "docs_url": "/docs"
    }


@app.middleware("http")
async def _track_activity(request, call_next):
    """[#125] 사용자 요청이 있었던 시각을 기록한다. 헬스체크(/health, /)는 서버를 깨우는 용도일 수 있어 제외한다."""
    if request.url.path not in ("/health", "/"):
        mark_activity()
    return await call_next(request)


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mode": "live",
        "supabase_connected": community_repo.is_connected(),
        # 지금 서버에 올라가 있는 커밋(Render 가 자동으로 넣어 주는 값). 로컬 실행에서는 빈 문자열.
        "commit": os.getenv("RENDER_GIT_COMMIT", "")[:7],
        # 경사 계산에 쓰는 고도 자료 (운영 반영 확인용). DEM 을 끄면 "off"
        "dem": (elevation_source() or {}).get("name") or "off",
        # 현재 위치 경로의 외부 보행 경로(OSRM) 호출 성공·실패 수와 마지막 실패 이유 (대체 경로 원인 확인용)
        "osrm": osrm_status(),
    }


class VoiceIntentRequest(BaseModel):
    speech_text: str = Field(..., min_length=1)
    dog_name: Optional[str] = None
    origin_lat: Optional[float] = None
    origin_lon: Optional[float] = None


@app.post("/api/v1/voice/intent")
def parse_voice_intent_endpoint(body: VoiceIntentRequest):
    """[영역 1] 보호자의 음성/자연어 발화에서 산책 의도 파라미터를 Gemini API로 분석."""
    payload, model_used, data_source = parse_voice_walk_intent(
        speech_text=body.speech_text,
        dog_name=body.dog_name,
    )
    landmark_park_id = resolve_landmark_park_id(payload.destination_landmark)
    return {
        "status": "success",
        "intent": payload.model_dump(),
        "landmark_park_id": landmark_park_id,
        "model_used": model_used,
        "data_source": data_source,
    }


def _parse_recent_feedback(req: Dict[str, Any]) -> List[Dict[str, Any]]:
    rf = req.get("recent_feedback")
    if not rf:
        return []
    feedback = []
    if rf.get("slope_dissatisfaction_count", 0) > 0:
        feedback.append({"tag": "too_steep", "count": rf["slope_dissatisfaction_count"]})
    if rf.get("shade_preference_count", 0) > 0:
        feedback.append({"tag": "cool_shade", "count": rf["shade_preference_count"]})
    return feedback


SOFT_SURFACE_MIN_KNOWN_RATIO = 0.5  # 노면 태그가 경로 길이의 절반 이상 확인될 때만 폭신 노면 비율을 카드에 보여 준다


def _measured_card_fields(profile: Dict[str, Any]) -> Dict[str, Any]:
    """실측 지표(course_profiles)로 카드 칸을 채운다. 자료가 없으면 숫자를 지어내지 않고 None/"정보 없음"."""
    known = profile.get("surface_known_ratio")
    soft = profile.get("soft_surface_ratio")
    if known is not None and soft is not None and known >= SOFT_SURFACE_MIN_KNOWN_RATIO:
        soft_percent: Optional[int] = round(soft * 100)
        soft_text = f"{soft_percent}%"
    else:
        soft_percent, soft_text = None, "정보 없음"
    stairs = profile.get("stairs_count")
    if stairs is None:
        stairs_text = "정보 없음"
    elif stairs == 0:
        stairs_text = "확인된 계단 0회"
    else:
        stairs_text = f"{stairs}회"
    return {
        "maxSlopePercent": profile.get("max_slope_percent"),
        "softSurfacePercent": soft_percent,
        "softRatio": soft_text,
        "stairsCount": stairs_text,
    }


def _build_candidate_course(cand: Any, score: Optional[float] = None, fallback_reason: str = "",
                            profile: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    surface_types = cand.surface_types or []
    is_soft = "grass" in surface_types or "dirt" in surface_types
    slope_for_reason = profile.get("max_slope_percent") if profile else cand.max_slope_percent
    slope_label = "실측 최대 경사" if profile else "경사"
    reason = (
        f"AI 맞춤 점수 {score:.0f}점: {cand.name} ({slope_label} {slope_for_reason}%)"
        if score is not None
        else fallback_reason
    )
    course = {
        "id": cand.route_id,
        "name": cand.name,
        "distanceKm": f"{cand.total_distance_m / 1000.0:.1f} km",
        "estimatedMinutes": int(cand.estimated_duration_minutes),
        "softRatio": "85%" if is_soft else "60%",
        "shadeLevel": "많음" if cand.average_shade_ratio > 0.5 else "보통",
        "stairsCount": "확인된 계단 0회" if not cand.has_stairs else "계단 있음",
        "maxSlopePercent": cand.max_slope_percent,
        "shadePercent": int(cand.average_shade_ratio * 100),
        "softSurfacePercent": 85 if "grass" in surface_types else 65,
        "reason": reason,
        "dataReliability": getattr(cand, "data_reliability", "estimated"),
        "slopeSource": getattr(cand, "slope_source", "approximation"),
    }
    if profile:
        # 경사·폭신 노면·계단은 실측값으로 바꾼다 (#114). 그늘은 자료가 없어 앱이 '정보 없음'을 처리한 뒤 바꾼다.
        course.update(_measured_card_fields(profile))
        if profile.get("slope_source"):
            course["slopeSource"] = profile["slope_source"]
        if profile.get("slope_source") == "dem" or profile.get("stairs_source") == "park_network_osm_tags":
            course["dataReliability"] = "measured"
    return course


def _build_course_list(agent_result: Any, profiles: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    profiles = profiles or {}
    if agent_result.all_scored_candidates:
        return [
            _build_candidate_course(scored.candidate, score=scored.total_score,
                                    profile=profiles.get(scored.candidate.route_id))
            for scored in agent_result.all_scored_candidates[:3]
        ]
    best = agent_result.best_route
    return [_build_candidate_course(best, fallback_reason=agent_result.briefing_message,
                                    profile=profiles.get(best.route_id))]


def _build_segmented_geojson(coords: List[List[float]], max_slope: float) -> Dict[str, Any]:
    """경로 좌표열을 DEM 고도차 및 노면 실측 기반 3대 안심 등급(safe/normal/caution)으로 분할."""
    return build_segmented_geojson(coords, max_slope_hint=max_slope)


def _build_step_pins(cand: Any, coords: List[List[float]]) -> List[Dict[str, Any]]:
    """실제 방향 전환 교차점 및 주의 구간 핀 목록 생성."""
    steps = getattr(cand, "turn_by_turn_steps", None) or []
    pins: List[Dict[str, Any]] = []
    for idx, step in enumerate(steps):
        pos = step.get("position")
        if not pos and len(coords) > idx + 1:
            pos = coords[idx + 1]
        elif not pos:
            pos = coords[0]
        pins.append({
            "id": f"{cand.route_id}_step_{idx + 1}",
            "kind": "caution" if "주의" in step.get("instruction", "") else "turn",
            "position": pos,
            "instruction": step.get("instruction", "안전하게 직진하세요"),
        })
    if not pins and len(coords) > 1:
        pins.append({
            "id": f"{cand.route_id}_step_1",
            "kind": "turn",
            "position": coords[1],
            "instruction": "보행로를 따라 안전하게 직진하세요",
        })
    return pins


def _parse_origin_coords(req: Dict[str, Any]) -> Tuple[float, float]:
    """출발 위경도 좌표 검증 및 파싱."""
    try:
        lat = float(req.get("origin_lat", 37.5665))
        lon = float(req.get("origin_lon", 126.9780))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="유효한 숫자 형식의 출발 좌표(origin_lat, origin_lon)가 필요합니다.")

    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        raise HTTPException(status_code=400, detail="위도(-90~90) 또는 경도(-180~180)의 허용 범위를 초과했습니다.")
    return lat, lon


def _validate_and_parse_walk_plan_request(req: Dict[str, Any]) -> Dict[str, Any]:
    """출발 좌표, 공원 ID, 출발 모드, 산책 시간 및 속도 입력 유효성 검증."""
    origin_lat, origin_lon = _parse_origin_coords(req)

    pilot_park_id = req.get("pilot_park_id") or req.get("park_id")
    if not pilot_park_id:
        hint_text = str(req.get("user_query") or req.get("request_text") or "")
        pilot_park_id = resolve_landmark_park_id(hint_text)
    if pilot_park_id is not None and not isinstance(pilot_park_id, str):
        raise HTTPException(status_code=400, detail="공원 식별자는 문자열이어야 합니다.")

    origin_mode = req.get("origin_mode")
    if not origin_mode:
        origin_mode = "park" if pilot_park_id else "current_location"
    if origin_mode not in ("park", "parking_pnr", "current_location"):
        raise HTTPException(status_code=400, detail="지원하지 않는 출발 모드입니다.")

    try:
        target_duration = float(req.get("target_duration_minutes", 30))
        speed_kmh = float(req.get("speed_kmh", 2.8))
        if not math.isfinite(target_duration) or not MIN_WALK_MINUTES <= target_duration <= MAX_WALK_MINUTES or not math.isfinite(speed_kmh) or speed_kmh <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"산책 시간({MIN_WALK_MINUTES}~{MAX_WALK_MINUTES}분)과 양수 보행 속도가 필요합니다.")

    return {
        "origin_lat": origin_lat,
        "origin_lon": origin_lon,
        "pilot_park_id": pilot_park_id,
        "origin_mode": origin_mode,
        "target_duration": target_duration,
        "speed_kmh": speed_kmh,
        "parking_lot_id": req.get("parking_lot_id") or req.get("parking_id"),
    }


def _app_intent_overrides(req: Dict[str, Any]) -> Dict[str, bool]:
    """앱이 보내는 avoid_stairs / prefer_shade / prefer_cushion 을 의도 조건으로 바꾼다. 보내지 않은 항목은 넣지 않는다."""
    mapping = {"avoid_stairs": "avoid_stairs", "prefer_shade": "shade_priority", "prefer_cushion": "prefer_soft"}
    return {key: req[field] for field, key in mapping.items() if isinstance(req.get(field), bool)}


def _resolve_parking_snap(
    origin_lat: float, origin_lon: float, parking_lot_id: Optional[str], origin_mode: str
) -> Tuple[float, float, Optional[Dict[str, Any]]]:
    """공영주차장 P&R 모드 또는 지정된 주차장의 출입구 좌표로 스냅 바인딩."""
    if parking_lot_id:
        for lot in _PILOT_PARKING_LOTS:
            if lot["parking_id"] == parking_lot_id:
                return lot["entrance_lat"], lot["entrance_lon"], lot
    elif origin_mode == "parking_pnr":
        closest = min(
            _PILOT_PARKING_LOTS,
            key=lambda lot: _haversine_distance_meters(origin_lat, origin_lon, lot["entrance_lat"], lot["entrance_lon"]),
        )
        return closest["entrance_lat"], closest["entrance_lon"], closest
    return origin_lat, origin_lon, None


def _validate_candidate_route(
    candidate: Any,
    selected_park: str,
    speed_kmh: float,
    target_duration: float,
    origin_coords: Tuple[float, float],
    request_id: str,
) -> Dict[str, Any]:
    """단일 후보 경로의 공원 경계 내 적합성 검증 및 속성 갱신."""
    validation = validate_park_route(
        candidate.geojson_coordinates, selected_park, speed_kmh, target_duration, origin_coords
    )
    candidate.total_distance_m = validation["distance_m"]
    candidate.estimated_duration_minutes = validation["estimated_minutes"]
    candidate.turn_by_turn_steps = build_turn_steps(candidate.geojson_coordinates)
    validation["route_source"] = candidate.route_source
    logger.info(
        json.dumps(
            {
                "event": "walk_candidate_validated",
                "request_id": request_id,
                "route_id": candidate.route_id,
                "source": candidate.route_source,
                "point_count": len(candidate.geojson_coordinates),
                **validation,
            },
            ensure_ascii=False,
        )
    )
    return validation


def _update_park_briefing(
    agent_result: Any, best: Any, weather_context: Dict[str, Any], validations: Dict[str, Any]
) -> None:
    """공원 경로의 최종 요약 브리핑 메시지 구성."""
    agent_result.briefing_message = (
        f"{best.name}: 실제 보행로 기준 약 {best.estimated_duration_minutes:.0f}분, {best.total_distance_m:.0f}m 코스입니다."
    )
    current_weather = weather_context.get("current", weather_context)
    surface_temp = current_weather.get("estimated_surface_temp")
    if isinstance(surface_temp, (int, float)):
        heat_notice = f"지면온도 {surface_temp:.1f}℃입니다. "
        if surface_temp > SAFE_MAX_C:
            heat_notice += (
                f"그늘 숲길을 이용하고 뜨거운 지면을 피해 "
                f"{weather_context.get('golden_time_window', '서늘한 시간대')} 산책을 권장합니다. "
            )
        agent_result.briefing_message = heat_notice + agent_result.briefing_message
    rain = rain_notice(weather_context.get("precipitation"))  # 비 예보 안내 (#114)
    if rain:
        agent_result.briefing_message = f"{rain} {agent_result.briefing_message}"
    if validations[best.route_id]["duration_is_alternative"]:
        agent_result.briefing_message += " 목표 시간보다 짧은 공원 내부 대안 코스입니다."
    approach_m = validations[best.route_id].get("entry_approach_m") or 0
    if approach_m:
        # 공원 경계 밖 주차장 출발 (#160): 공원 코스는 목표 시간에 맞추고 진입로 왕복을 더했다
        agent_result.briefing_message += (
            f" 주차장에서 공원 보행로까지 편도 약 {approach_m:.0f}m의 공원 밖 보행로를 왕복하는 시간이 포함돼 있고,"
            f" 공원 안 코스는 약 {validations[best.route_id]['loop_estimated_minutes']:.0f}분입니다."
        )


def _validate_and_finalize_park_candidates(
    agent_result: Any,
    selected_park: Optional[str],
    speed_kmh: float,
    target_duration: float,
    origin_lon: float,
    origin_lat: float,
    weather_context: Dict[str, Any],
    request_id: str,
) -> Dict[str, Any]:
    """공원 모드 후보 경로 일괄 검증 및 최고 경로 확정."""
    if not selected_park:
        raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 신뢰할 수 있는 경계 데이터가 없습니다.")

    best = agent_result.best_route
    scored_candidates = agent_result.all_scored_candidates
    candidates = [s.candidate for s in scored_candidates] or [best]
    valid_scored = []
    validations: Dict[str, Any] = {}
    last_error = None

    for index, candidate in enumerate(candidates):
        try:
            validation = _validate_candidate_route(
                candidate, selected_park, speed_kmh, target_duration, (origin_lon, origin_lat), request_id
            )
            validations[candidate.route_id] = validation
            if scored_candidates:
                valid_scored.append(scored_candidates[index])
            else:
                best = candidate
        except RoutePlanningError as exc:
            last_error = exc
            logger.warning(
                json.dumps(
                    {
                        "event": "walk_candidate_rejected",
                        "request_id": request_id,
                        "route_id": candidate.route_id,
                        "source": candidate.route_source,
                        "park_id": selected_park,
                        "point_count": len(candidate.geojson_coordinates),
                        "code": exc.code,
                    },
                    ensure_ascii=False,
                )
            )
            continue

    if not validations:
        raise last_error or RoutePlanningError("NO_VALID_LOOP", "공원 안의 유효한 순환 경로가 없습니다.")

    agent_result.all_scored_candidates = valid_scored
    if valid_scored:
        best = valid_scored[0].candidate
        agent_result.best_score = valid_scored[0].total_score
    agent_result.best_route = best
    _update_park_briefing(agent_result, best, weather_context, validations)
    return validations


def _build_course_plans_map(agent_result: Any, fallback_coords: Any) -> Dict[str, Any]:
    """스코어링된 후보 경로별 geojson 및 stepPins 맵 구성."""
    course_plans: Dict[str, Any] = {}
    if agent_result.all_scored_candidates:
        for scored in agent_result.all_scored_candidates:
            cand = scored.candidate
            cand_coords = cand.geojson_coordinates if cand.geojson_coordinates else fallback_coords
            course_plans[cand.route_id] = {
                "route": _build_segmented_geojson(cand_coords, cand.max_slope_percent),
                "stepPins": _build_step_pins(cand, cand_coords),
            }
    return course_plans


def _build_course_profiles(agent_result: Any, fallback_coords: Any, park_id: Optional[str]) -> Dict[str, Any]:
    """후보 경로별 실측 지표 (경사·노면·계단). 카드의 고정 프로필 값과 별도로 실제 좌표로 계산한다."""
    profiles: Dict[str, Any] = {}
    for scored in agent_result.all_scored_candidates or []:
        cand = scored.candidate
        coords = cand.geojson_coordinates if cand.geojson_coordinates else fallback_coords
        profiles[cand.route_id] = measure_route_profile(coords, park_id)
    return profiles


def _build_walk_plan_response(
    agent_result: Any,
    request_id: str,
    park_mode: bool,
    selected_park: Optional[str],
    matched_parking: Optional[Dict[str, Any]],
    validations: Dict[str, Any],
) -> Dict[str, Any]:
    """산책 경로 계획 API 최종 응답 딕셔너리 생성."""
    best = agent_result.best_route
    coords = best.geojson_coordinates if best.geojson_coordinates else V1_ROAD_ALIGNED_COORDS
    profiles = _build_course_profiles(agent_result, coords, selected_park if park_mode else None)
    resp_data = {
        "request_id": request_id,
        "courses": _build_course_list(agent_result, profiles),
        "geojson": _build_segmented_geojson(coords, best.max_slope_percent),
        "step_pins": _build_step_pins(best, coords),
        "course_plans": _build_course_plans_map(agent_result, coords),
        "briefing": agent_result.briefing_message,
        "summary": agent_result.briefing_message,
        "score": agent_result.best_score,
        "is_live_server": True,
        "weather": agent_result.weather_context,
        # 경사·구간 색을 계산한 고도 자료와 출처 문구 (DEM 을 쓰지 않으면 None, 앱이 출처를 표시한다)
        "elevation_source": elevation_source(),
        # 후보별 실측 지표 (경사는 DEM/근사 구분, 노면·계단은 공원 보행망 OSM 태그, 자료 없으면 None)
        "course_profiles": profiles,
        # 후보별 경로 출처: osrm_live(실제 보행로) / park_graph_*(공원 보행망) / rectangle_fallback 등 대체 경로
        "route_sources": {s.candidate.route_id: s.candidate.route_source for s in agent_result.all_scored_candidates or []},
    }
    if park_mode:
        resp_data["route_validation"] = validations
        resp_data["validated_park_id"] = selected_park
    logger.info(
        json.dumps(
            {
                "event": "walk_plan_completed",
                "request_id": request_id,
                "park_id": selected_park,
                "route_id": best.route_id,
                "route_source": best.route_source,
                "status": 200,
            },
            ensure_ascii=False,
        )
    )
    if matched_parking:
        resp_data["parking_lot"] = matched_parking
    return resp_data


@app.post(
    "/api/v1/walk/plan",
    responses={
        400: {"description": "출발 좌표 범위 오류 또는 유효하지 않은 입력"},
        422: {"description": "공원 영역 내 경로 탐색 실패"},
        500: {"description": "LangGraph AI Agent 오케스트레이션 내부 오류"},
    },
)
def plan_walk_route(req: Dict[str, Any]):
    """[US-A1, US-A3, US-B1~B3, US-E3, US-F1, US-G1] LangGraph ReAct Walk Planning Agent 코어 연동 엔드포인트."""
    dog_name = req.get("dog_name", "강아지")
    request_id = str(uuid4())

    params = _validate_and_parse_walk_plan_request(req)
    origin_lat = params["origin_lat"]
    origin_lon = params["origin_lon"]
    pilot_park_id = params["pilot_park_id"]
    origin_mode = params["origin_mode"]
    target_duration = params["target_duration"]
    speed_kmh = params["speed_kmh"]
    parking_lot_id = params["parking_lot_id"]

    origin_lat, origin_lon, matched_parking = _resolve_parking_snap(
        origin_lat, origin_lon, parking_lot_id, origin_mode
    )

    weather_context = req.get("weather_context")
    if not weather_context:
        weather_context = weather_context_from_response(_live_heat_risk_response(origin_lat, origin_lon))

    # 앱 산책 설정의 체크 항목 (계단 피하기·그늘·폭신한 길). 예전에는 읽지 않아 설정이 추천에 반영되지 않았다
    intent_overrides = _app_intent_overrides(req)
    request_text = str(req.get("request_text") or "").strip()
    if intent_overrides or request_text:
        # 앱 요청: 조건은 체크 항목으로 받으므로 기본 문장에 특정 노면을 넣지 않고, 사용자가 쓴 요청 문장을 붙인다
        default_query = f"{dog_name}와 {target_duration:g}분 동안 산책하고 싶어요. {request_text}".strip()
    else:
        default_query = f"{dog_name}와 {target_duration:g}분 동안 폭신한 길 위주로 걷고 싶어요."
    user_query = req.get("user_query") or req.get("prompt") or req.get("query") or default_query

    client_dog = {
        "dog_id": req.get("dog_id", "dog_default"),
        "name": dog_name,
        "breed": req.get("breed", "반려견"),
        "age_years": req.get("age_years", 4),
        "weight_kg": req.get("weight_kg", 4.0),
        "speed_kmh": speed_kmh,
        "joint_care_level": req.get("joint_care_level", 1),
    }

    recent_feedback = _parse_recent_feedback(req)
    park_mode = origin_mode in ("park", "parking_pnr")
    selected_park = resolve_pilot_park_key(origin_lat, origin_lon, pilot_park_id=pilot_park_id) if park_mode else None
    logger.info(
        json.dumps(
            {
                "event": "walk_plan_requested",
                "request_id": request_id,
                "origin_mode": origin_mode,
                "park_id": selected_park,
                # 현재 위치 출발은 자택일 수 있어 운영 로그에는 약 1km 단위(소수 둘째 자리)로만 남긴다 (200m 마스킹 감사)
                "origin_approx": [round(origin_lon, 2), round(origin_lat, 2)],
                "target_minutes": target_duration,
            },
            ensure_ascii=False,
        )
    )

    try:
        agent_result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=client_dog,
            client_recent_feedback=recent_feedback,
            weather_context=weather_context,
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            origin_mode=origin_mode,
            parking_lot_id=parking_lot_id,
            # 공원 ID 없이 온 주차장 출발도 위치로 정한 공원(selected_park)으로 채점한다 (진입로 거리 제외, #160)
            pilot_park_id=selected_park or pilot_park_id,
            intent_overrides=intent_overrides,
        )

        validations = {}
        if park_mode:
            validations = _validate_and_finalize_park_candidates(
                agent_result=agent_result,
                selected_park=selected_park,
                speed_kmh=speed_kmh,
                target_duration=target_duration,
                origin_lon=origin_lon,
                origin_lat=origin_lat,
                weather_context=weather_context,
                request_id=request_id,
            )

        return _build_walk_plan_response(
            agent_result=agent_result,
            request_id=request_id,
            park_mode=park_mode,
            selected_park=selected_park,
            matched_parking=matched_parking,
            validations=validations,
        )
    except RoutePlanningError as exc:
        logger.warning(
            json.dumps(
                {
                    "event": "walk_plan_failed",
                    "request_id": request_id,
                    "park_id": selected_park,
                    "code": exc.code,
                    "status": 422,
                },
                ensure_ascii=False,
            )
        )
        return JSONResponse(status_code=422, content={"detail": str(exc), "code": exc.code, "request_id": request_id})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/v1/walk/reroute")
def reroute_walk(req: RerouteRequest):
    """[US-D2] 현장 위험 감지 시 해당 지점을 임시 차단(비용 10배)하고 3초 이내 안전 우회 경로 재산출.

    - 신뢰도 0.70 미만 또는 severity=info 는 현 경로 유지(KEEP_ROUTE)
    - 응답 geojson 은 [lon, lat] LineString, 시작=현재 위치, 끝=목적지
    """
    return reroute_around_hazard(req)


@app.post("/api/v1/surface/inspect")
async def inspect_surface(
    image: UploadFile = File(..., description="현장 위험물 또는 공원 종합안내판 사진"),
    inspect_type: InspectType = Form("hazard"),
):
    """[US-D1 입구] 사진을 받아 위험물/안내판 판독 결과를 Pydantic 구조화 JSON 으로 반환.

    GEMINI_API_KEY 미설정 시 mock 모드(is_live_vision=false). 라이브 비전 체인은 2번 데이터 담당 연결 예정.
    """
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="이미지 파일(image/*)만 업로드할 수 있습니다.",
        )
    data = await image.read()
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="이미지는 8MB 이하여야 합니다.")
    return run_vision_inspection(data, image.filename or "", inspect_type)


@app.post("/api/v1/hazards", status_code=status.HTTP_201_CREATED)
def report_hazard(req: HazardReportRequest):
    """[US-D2 AC3] 공공 위험 제보 적재 (Supabase hazard_reports 우선, 인메모리 자동 폴백)."""
    report = hazard_repo.save(req)
    return {"status": "reported", "report": report, "is_supabase": hazard_repo.is_connected()}


@app.get("/api/v1/hazards")
def list_nearby_hazards(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    radius_m: float = Query(500.0, gt=0.0, le=5000.0),
):
    """현재 위치 반경 내 활성 위험 제보 조회 (가까운 순)."""
    reports = hazard_repo.nearby(lat, lon, radius_m)
    return {"count": len(reports), "radius_m": radius_m, "reports": reports, "is_supabase": hazard_repo.is_connected()}


@app.post("/api/v1/community/share")
def share_community_course(req: CommunityCourseShareRequest):
    """[US-G2] 출발지 및 도착지 200m 공간 절단 및 교차로(Node) 스냅 마스킹 후 피드 등록."""
    mask_result = apply_spatial_masking_to_course(
        req.raw_coordinates, masking_radius_m=200.0, snap_to_intersection=True
    )
    current_count = len(community_repo.get_feeds())
    new_feed = {
        "course_id": f"feed_{current_count + 1}",
        "title": req.course_title,
        "masked_polyline": mask_result["masked_coordinates"],
        "distance_m": 1400.0,
        "duration_min": 22,
        "rating": float(req.satisfaction_rating),
        "is_origin_masked": mask_result["is_masked"],
        "intersection_snapped": mask_result.get("intersection_snapped", False),
    }
    saved_feed = community_repo.save_course(new_feed)
    return {
        "status": "shared",
        "feed": saved_feed,
        "is_supabase": community_repo.is_connected(),
        "intersection_snapped": mask_result.get("intersection_snapped", False),
    }


def _supabase_client():
    """서버 전용 Supabase 클라이언트. 연결되지 않았으면 None. (테스트에서 교체한다)"""
    return community_repo.raw_client()


def _bearer_token(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def _run_walk_share(action, walk_id: str, authorization: Optional[str]):
    try:
        UUID(walk_id)
    except ValueError:
        raise HTTPException(status_code=422, detail={"code": "INVALID_WALK_ID", "message": "산책 기록 id 형식이 올바르지 않습니다."})
    client = _supabase_client()
    if client is None:
        raise HTTPException(status_code=503, detail={"code": "DB_NOT_CONNECTED", "message": "데이터베이스에 연결되어 있지 않습니다."})
    try:
        user_id = verify_user(client, _bearer_token(authorization))
        return action(client, user_id, walk_id)
    except WalkShareError as err:
        raise HTTPException(status_code=err.status, detail={"code": err.code, "message": err.message})


_WALK_SHARE_RESPONSES = {
    422: {"description": "산책 기록 ID 형식이 올바르지 않음 (UUID 형식 오류)"},
    503: {"description": "데이터베이스 미연결 상태"},
}


@app.post("/api/v1/walks/{walk_id}/share", responses=_WALK_SHARE_RESPONSES)
def share_walk_review(walk_id: str, authorization: Optional[str] = Header(default=None)):
    """[US-G2 / #116] 본인 산책 기록을 서버가 200m 마스킹한 좌표로 공개한다. (Authorization: Bearer <로그인 토큰>)"""
    return _run_walk_share(share_walk, walk_id, authorization)


@app.post("/api/v1/walks/{walk_id}/unshare", responses=_WALK_SHARE_RESPONSES)
def unshare_walk_review(walk_id: str, authorization: Optional[str] = Header(default=None)):
    """[US-G2 / #116] 공개한 산책 기록을 다시 비공개로 돌리고 공개용 좌표를 지운다."""
    return _run_walk_share(unshare_walk, walk_id, authorization)


@app.post("/api/v1/community/share", status_code=status.HTTP_201_CREATED)
def share_community_course_endpoint(body: CommunityCourseShareRequest):
    """[US-G2] 200m 공간 마스킹(Spatial Jittering)을 적용한 완주 코스를 커뮤니티 피드에 공유 등록."""
    masked_result = apply_spatial_masking_to_course(body.raw_coordinates, masking_radius_m=200.0)
    masked_coords = masked_result["masked_coordinates"]
    
    # 총 거리 및 예상 산책 시간 계산 (평균 시속 3.6km/h = 분당 60m 기준)
    total_dist_m = sum(
        _haversine_distance_meters(c1[1], c1[0], c2[1], c2[0])
        for c1, c2 in zip(masked_coords[:-1], masked_coords[1:])
    ) if len(masked_coords) > 1 else 1000.0
    duration_min = max(10, round(total_dist_m / 60.0))

    feed_item = {
        "course_id": f"feed_{uuid4().hex[:8]}",
        "title": body.course_title,
        "masked_polyline": masked_coords,
        "distance_m": round(total_dist_m),
        "duration_min": duration_min,
        "rating": float(body.satisfaction_rating),
        "is_origin_masked": True,
        "user_id": body.user_id,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    saved_feed = community_repo.save_course(feed_item)
    return {
        "status": "success",
        "message": "코스가 성공적으로 커뮤니티에 공유되었습니다.",
        "feed": saved_feed,
        "is_supabase": community_repo.is_connected(),
    }


@app.get("/api/v1/community/feed")
def get_community_feed():
    """공유된 안심 코스 피드 목록 조회 (Supabase DB 우선, 인메모리 자동 폴백)."""
    return {
        "feeds": community_repo.get_feeds(),
        "is_supabase": community_repo.is_connected(),
    }


def _generate_fallback_hourly_dtos() -> List[Dict[str, Any]]:
    hourly = []
    for h in range(24):
        air_temp = round(26.5 + 4.5 * math.cos(((h - 14) / 12) * math.pi), 1)
        if 20 <= h or h < 6:
            sky = "night"  # 야간에는 일사량 0.0 (지면열 = 기온)
            weight = 0.0
        elif 10 <= h <= 15:
            sky = "clear"  # 한낮에는 일사량 1.0 (지면열 = 기온 + 15도)
            weight = 1.0
        else:
            sky = "partly_cloudy"
            weight = 0.6
        dto = determine_heat_risk_dto(hour=h, air_temp=air_temp, sky=sky)
        d = dto.model_dump() if hasattr(dto, "model_dump") else dto.dict()
        d["solar_radiation_w_m2"] = round(weight * 1000.0, 1)
        d["surface_temps"] = _fallback_surface_temps(air_temp, weight)
        hourly.append(d)
    return hourly


def _fallback_surface_temps(air_temp: float, weight: float) -> Dict[str, float]:
    """대체 응답의 노면별 지면온도 (무일사 기저 오프셋 포함, weather_context 상수와 같은 값)."""
    return {
        surface: round(air_temp + NO_SUN_SURFACE_OFFSET_C * (1.0 - weight) + weight * SURFACE_HEAT_GAIN_MAP[surface], 1)
        for surface in ("asphalt", "paved", "dirt", "grass")
    }


def _extract_safe_blocks(hourly: List[Dict[str, Any]]) -> List[Tuple[int, int]]:
    """6시~22시 사이 안전 골든타임 블록 추출 (1.5~2시간 슬롯 최적화)."""
    safe_blocks: List[Tuple[int, int]] = []
    block_start: Optional[int] = None
    for h in range(6, 23):
        is_safe = hourly[h]["is_golden_time"] if h < len(hourly) else False
        if is_safe:
            if block_start is None:
                block_start = h
        elif block_start is not None:
            safe_blocks.append((block_start, h))
            block_start = None
    if block_start is not None:
        safe_blocks.append((block_start, 22))
    return safe_blocks


def _determine_golden_window(safe_blocks: List[Tuple[int, int]], now_hour: int) -> str:
    """안전 블록들로부터 오늘 현재, 오늘 향후, 또는 익일 첫 골든타임 윈도우 문자열 산출."""
    if not safe_blocks:
        return "18:00 ~ 20:00"

    # 1) 현재 진행 중인 골든타임 블록
    for b_start, b_end in safe_blocks:
        if b_start <= now_hour < b_end:
            return f"{b_start:02d}:00 ~ {min(b_end, b_start + 2):02d}:00"

    # 2) 오늘 앞으로 다가올 가장 가까운 골든타임 블록
    for b_start, b_end in safe_blocks:
        if b_start > now_hour:
            return f"{b_start:02d}:00 ~ {min(b_end, b_start + 2):02d}:00"

    # 3) 내일 첫 번째 골든타임 블록
    first = safe_blocks[0]
    return f"{first[0]:02d}:00 ~ {min(first[1], first[0] + 2):02d}:00"


def _fallback_heat_risk_response(lat: float, lon: float) -> Dict[str, Any]:
    """기상청 호출이 불가능할 때 쓰는 KST 시간대 기반 지면열 추정 (UTC 시차 오류 원천 차단)."""
    now_kst = to_kst(None)
    now_hour = now_kst.hour
    hourly = _generate_fallback_hourly_dtos()

    # Open-Meteo 실시간 기상 조회 가능 시 현재 기온과 일사량 실측값으로 정밀 보정 (단위 테스트 환경에서는 외부 네트워크 호출 생략)
    if "PYTEST_CURRENT_TEST" not in os.environ:
        try:
            om_data = open_meteo_client.fetch_hourly_weather_forecast(lat, lon, now_kst, timeout=1.5, forecast_days=1)
            hour_start = now_kst.replace(minute=0, second=0, microsecond=0)
            curr = om_data.get(hour_start)
            if curr:
                weight = open_meteo_client.radiation_to_weight(curr["radiation"]) if (6 <= now_hour < 20) else 0.0
                surface = estimate_surface_temp(curr["air"], weight)
                is_golden = surface <= SAFE_MAX_C  # Issue #153 나 안: 33℃ 이하만 안전
                if is_golden:
                    risk_lvl = "SAFE"
                elif surface <= CAUTION_MAX_C:
                    risk_lvl = "CAUTION"
                else:
                    risk_lvl = "DANGER"

                hourly[now_hour] = {
                    "hour": now_hour,
                    "air_temp_celsius": curr["air"],
                    "estimated_surface_temp": surface,
                    "solar_radiation_w_m2": round(weight * 1000.0, 1),
                    "surface_temps": _fallback_surface_temps(curr["air"], weight),
                    "risk_level": risk_lvl,
                    "is_golden_time": is_golden,
                    "notice": "본 지수는 기상청 예보 모델 기반 추정치입니다.",
                }
        except (open_meteo_client.OpenMeteoError, OSError, ValueError, KeyError):
            # Open-Meteo 실패(시간 초과·연결 오류 포함)는 OpenMeteoError 또는 OSError(TimeoutError 포함)로 온다. 놓치면 /walk/plan 전체가 500 이 된다 (#104).
            pass

    safe_blocks = _extract_safe_blocks(hourly)
    golden_window = _determine_golden_window(safe_blocks, now_hour)
    current_dto = hourly[now_hour] if now_hour < len(hourly) else hourly[12]

    return {
        "status": "success",
        "current": current_dto,
        "pop": current_dto.get("pop", 10),
        "air_quality": {
            "pm10": 25.0,
            "pm25": 14.0,
            "grade_label": "좋음",
            "station_name": "기본",
            "data_source": "estimated",
        },
        "golden_time_window": golden_window,
        "hourly_forecast": hourly,
        "notice": "본 지수는 기상청 예보 모델 기반 추정치(실시간 기상 미연결 시 제공되는 [가상 시뮬레이션 추정치])입니다.",
        "coordinates": {"lat": lat, "lon": lon},
        "data_source": "fallback_estimate",
        "insolation_source": None,
        "attribution": None,
        "golden_time_window_day": "today",
        "grid": None,
        "bases": {},
        "warnings": ["실시간 기상 정보를 가져오지 못해 KST 기준 [가상 시뮬레이션 추정치]로 산출한 값입니다."],
    }


_HEAT_RISK_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
_HEAT_RISK_CACHE_TTL_S = 600.0  # 10분 TTL


def clear_heat_risk_cache() -> None:
    _HEAT_RISK_CACHE.clear()


def _live_heat_risk_response(lat: float, lon: float, force_refresh: bool = False) -> Dict[str, Any]:
    """기상청 실황·예보와 Open-Meteo 일사량으로 만든 응답. 실패하면 Open-Meteo 실시간 또는 KST 기반 추정으로 대체한다."""
    # 1.1km 격자 단위 메모리 캐싱 (테스트 환경에서는 격리)
    cache_key = (round(lat, 2), round(lon, 2))
    now_ts = time.time()
    if "PYTEST_CURRENT_TEST" not in os.environ and not force_refresh and cache_key in _HEAT_RISK_CACHE:
        cached_ts, cached_resp = _HEAT_RISK_CACHE[cache_key]
        if now_ts - cached_ts < _HEAT_RISK_CACHE_TTL_S:
            return cached_resp

    try:
        res = build_heat_risk_response(lat, lon)
        if "PYTEST_CURRENT_TEST" not in os.environ:
            _HEAT_RISK_CACHE[cache_key] = (now_ts, res)
        return res
    except (KmaApiError, ValueError, OSError) as exc:
        logger.warning("기상청 API 조회 실패, 대체 경로를 시도합니다: %s", exc)
        # [제안 1 & 이슈 #104] 운영 환경(테스트 환경 격리 외)에서는 Open-Meteo 무키 실시간 예보를 2순위로 호출
        if "PYTEST_CURRENT_TEST" not in os.environ:
            try:
                om_res = build_open_meteo_heat_risk_response(lat, lon, timeout=2.5)
                _HEAT_RISK_CACHE[cache_key] = (now_ts, om_res)
                return om_res
            except (open_meteo_client.OpenMeteoError, OSError, ValueError, KeyError) as om_exc:
                logger.warning("Open-Meteo 실시간 예보 조회도 실패하여 완전 대체 추정으로 전환합니다: %s", om_exc)
        response = _fallback_heat_risk_response(lat, lon)
        response["warnings"].append(f"사유: {exc}")
        return response


@app.get("/api/v1/weather/heat-risk")
def get_weather_heat_risk(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
):
    """[US-F1] 기상청 실황·단기예보와 일사량 기반 시간대별 지면열 추정 및 안전 골든타임 조회."""
    return _live_heat_risk_response(lat, lon)


# 공영주차장은 backend/fixtures/parking_lots_pilot.json 한 곳에서 읽는다 (공식 표준데이터 6곳 + 기존 데이터 11곳).
# verified=false 항목은 공식 자료와 대조되지 않았거나 좌표가 맞지 않는 값이다 (data_issue 참고).
_PILOT_PARKING_LOTS = load_pilot_parking_lots()


def _haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    r = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return round(2.0 * r * math.atan2(math.sqrt(a), math.sqrt(1.0 - a)), 1)


@app.get("/api/v1/parking/nearby")
def get_nearby_parking_lots(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    radius_m: float = Query(1500.0, gt=0.0, le=10000.0),
    verified_only: bool = Query(False),
):
    """[US-G1] 대전 3대 공원 & 세종호수공원 4대 파일럿 거점 반경 내 공영주차장 검색.

    verified_only=true 이면 공식 자료로 확인된 주차장만 돌려준다.
    """
    nearby_lots = find_nearby_parking_lots(lat, lon, radius_m, lots=_PILOT_PARKING_LOTS, verified_only=verified_only)
    return {
        "status": "success",
        "total_count": len(nearby_lots),
        "search_radius_m": radius_m,
        "query_center": {"lat": lat, "lon": lon},
        "parking_lots": nearby_lots,
    }

