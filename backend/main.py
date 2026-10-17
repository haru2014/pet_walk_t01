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
from uuid import uuid4

from dotenv import load_dotenv

# .env 를 가장 먼저 읽어야 agent.* 모듈 import 시 os.getenv(SUPABASE_URL 등) 가 값을 본다.
load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from agent.walk_planning_agent import run_walk_planning_agent
from agent.pilot_park_routes import resolve_pilot_park_key
from agent.park_route_validation import RoutePlanningError, validate_park_route
from agent.route_steps import build_turn_steps
from agent.road_network_routes import V1_ROAD_ALIGNED_COORDS
from agent.supabase_repository import community_repo
from agent.hazard_service import (
    HazardReportRepository,
    HazardReportRequest,
    InspectType,
    RerouteRequest,
    reroute_around_hazard,
    run_vision_inspection,
)
from agent.surface_slope_evaluator import build_segmented_geojson
from services.kma_weather_client import KmaApiError
from services.parking_lots import find_nearby_parking_lots, load_pilot_parking_lots
from services.weather_context import build_heat_risk_response, weather_context_from_response
from test_case.test_api_contracts import (
    apply_spatial_masking_to_course,
    WalkPlanResponseV1,
    CommunityCourseShareRequest,
    CommunityCourseSummary,
)
from test_case.test_thermal_and_parking import determine_heat_risk_dto

app = FastAPI(
    title="편안하개 (PetWalk) API",
    description="AI Native 반려견 맞춤형 안심 노면 산책 에이전트 및 핸즈프리 모바일 플랫폼 REST API",
    version="1.0.0",
)
logger = logging.getLogger(__name__)

# 🌐 크로스 오리진(CORS) 미들웨어 설정 (Expo Web 및 모바일 통신 허용)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "mode": "live",
        "supabase_connected": community_repo.is_connected(),
        # 지금 서버에 올라가 있는 커밋(Render 가 자동으로 넣어 주는 값). 로컬 실행에서는 빈 문자열.
        "commit": os.getenv("RENDER_GIT_COMMIT", "")[:7],
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


def _build_candidate_course(cand: Any, score: Optional[float] = None, fallback_reason: str = "") -> Dict[str, Any]:
    surface_types = cand.surface_types or []
    is_soft = "grass" in surface_types or "dirt" in surface_types
    reason = (
        f"AI 맞춤 점수 {score:.0f}점: {cand.name} (경사 {cand.max_slope_percent}% 이하)"
        if score is not None
        else fallback_reason
    )
    return {
        "id": cand.route_id,
        "name": cand.name,
        "distanceKm": f"{cand.total_distance_m / 1000.0:.1f} km",
        "estimatedMinutes": int(cand.estimated_duration_minutes),
        "softRatio": "85%" if is_soft else "60%",
        "shadeLevel": "많음" if cand.average_shade_ratio > 0.5 else "보통",
        "stairsCount": "0회" if not cand.has_stairs else "계단 있음",
        "maxSlopePercent": cand.max_slope_percent,
        "shadePercent": int(cand.average_shade_ratio * 100),
        "softSurfacePercent": 85 if "grass" in surface_types else 65,
        "reason": reason,
    }


def _build_course_list(agent_result: Any) -> List[Dict[str, Any]]:
    if agent_result.all_scored_candidates:
        return [
            _build_candidate_course(scored.candidate, score=scored.total_score)
            for scored in agent_result.all_scored_candidates[:3]
        ]
    return [_build_candidate_course(agent_result.best_route, fallback_reason=agent_result.briefing_message)]


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
    dog_name = req.get("dog_name", "아이")
    target_duration = req.get("target_duration_minutes", 30)
    request_id = str(uuid4())

    # 1. 출발 좌표 유효성 및 범위 검증
    try:
        origin_lat = float(req.get("origin_lat", 37.5665))
        origin_lon = float(req.get("origin_lon", 126.9780))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="유효한 숫자 형식의 출발 좌표(origin_lat, origin_lon)가 필요합니다.")

    if not (-90.0 <= origin_lat <= 90.0 and -180.0 <= origin_lon <= 180.0):
        raise HTTPException(status_code=400, detail="위도(-90~90) 또는 경도(-180~180)의 허용 범위를 초과했습니다.")

    pilot_park_id = req.get("pilot_park_id") or req.get("park_id")
    if pilot_park_id is not None and not isinstance(pilot_park_id, str):
        raise HTTPException(status_code=400, detail="공원 식별자는 문자열이어야 합니다.")
    origin_mode = req.get("origin_mode")
    if not origin_mode:
        origin_mode = "park" if pilot_park_id else "current_location"
    if origin_mode not in ("park", "parking_pnr", "current_location"):
        raise HTTPException(status_code=400, detail="지원하지 않는 출발 모드입니다.")
    try:
        target_duration = float(target_duration)
        speed_kmh = float(req.get("speed_kmh", 2.8))
        if not math.isfinite(target_duration) or not 10 <= target_duration <= 90 or not math.isfinite(speed_kmh) or speed_kmh <= 0:
            raise ValueError()
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="산책 시간(10~90분)과 양수 보행 속도가 필요합니다.")
    parking_lot_id = req.get("parking_lot_id") or req.get("parking_id")

    # 🚗 [US-G1] 공영주차장 P&R 모드 또는 parking_lot_id 지정 시 출입구 좌표로 강제 스냅 바인딩
    matched_parking = None
    if parking_lot_id:
        for lot in _PILOT_PARKING_LOTS:
            if lot["parking_id"] == parking_lot_id:
                matched_parking = lot
                origin_lat = lot["entrance_lat"]
                origin_lon = lot["entrance_lon"]
                break
    elif origin_mode == "parking_pnr":
        # 현재 좌표에서 가장 가까운 파일럿 공영주차장 자동 탐색 및 스냅
        closest = min(
            _PILOT_PARKING_LOTS,
            key=lambda lot: _haversine_distance_meters(origin_lat, origin_lon, lot["entrance_lat"], lot["entrance_lon"])
        )
        matched_parking = closest
        origin_lat = closest["entrance_lat"]
        origin_lon = closest["entrance_lon"]

    # 🌤️ [US-F1] 기상청 지면열 추정 DTO 바인딩
    weather_context = req.get("weather_context")
    if not weather_context:
        weather_context = weather_context_from_response(_live_heat_risk_response(origin_lat, origin_lon))

    user_query = (
        req.get("user_query")
        or req.get("prompt")
        or req.get("query")
        or f"{dog_name}와 {target_duration:g}분 동안 폭신한 길 위주로 걷고 싶어요."
    )

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
    logger.info(json.dumps({"event": "walk_plan_requested", "request_id": request_id,
                           "origin_mode": origin_mode, "park_id": selected_park,
                           "origin": [origin_lon, origin_lat], "target_minutes": target_duration}, ensure_ascii=False))

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
            pilot_park_id=pilot_park_id,
        )

        best = agent_result.best_route
        validations = {}
        if park_mode:
            if not selected_park:
                raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 신뢰할 수 있는 경계 데이터가 없습니다.")
            # Independently validate every candidate at the response boundary.
            # An agent, cache, static route or fallback cannot bypass this gate.
            valid_scored = []
            last_error = None
            scored_candidates = agent_result.all_scored_candidates
            candidates = [s.candidate for s in scored_candidates] or [best]
            for index, candidate in enumerate(candidates):
                try:
                    validation = validate_park_route(candidate.geojson_coordinates, selected_park, speed_kmh,
                                                     target_duration, (origin_lon, origin_lat))
                except RoutePlanningError as exc:
                    last_error = exc
                    logger.warning(json.dumps({"event": "walk_candidate_rejected", "request_id": request_id,
                                               "route_id": candidate.route_id, "source": candidate.route_source,
                                               "park_id": selected_park, "point_count": len(candidate.geojson_coordinates),
                                               "code": exc.code}, ensure_ascii=False))
                    continue
                candidate.total_distance_m = validation["distance_m"]
                candidate.estimated_duration_minutes = validation["estimated_minutes"]
                candidate.turn_by_turn_steps = build_turn_steps(candidate.geojson_coordinates)
                validation["route_source"] = candidate.route_source
                validations[candidate.route_id] = validation
                if scored_candidates:
                    valid_scored.append(scored_candidates[index])
                else:
                    best = candidate
                logger.info(json.dumps({"event": "walk_candidate_validated", "request_id": request_id,
                                        "route_id": candidate.route_id, "source": candidate.route_source,
                                        "point_count": len(candidate.geojson_coordinates), **validation}, ensure_ascii=False))
            if not validations:
                raise last_error or RoutePlanningError("NO_VALID_LOOP", "공원 안의 유효한 순환 경로가 없습니다.")
            agent_result.all_scored_candidates = valid_scored
            if valid_scored:
                best = valid_scored[0].candidate
                agent_result.best_score = valid_scored[0].total_score
            agent_result.best_route = best
            agent_result.briefing_message = f"{best.name}: 실제 보행로 기준 약 {best.estimated_duration_minutes:.0f}분, {best.total_distance_m:.0f}m 코스입니다."
            current_weather = weather_context.get("current", weather_context)
            surface_temp = current_weather.get("estimated_surface_temp")
            if isinstance(surface_temp, (int, float)):
                heat_notice = f"지면온도 {surface_temp:.1f}℃입니다. "
                if surface_temp > 35:
                    heat_notice += f"그늘 숲길을 이용하고 뜨거운 지면을 피해 {weather_context.get('golden_time_window', '서늘한 시간대')} 산책을 권장합니다. "
                agent_result.briefing_message = heat_notice + agent_result.briefing_message
            if validations[best.route_id]["duration_is_alternative"]:
                agent_result.briefing_message += " 목표 시간보다 짧은 공원 내부 대안 코스입니다."

        coords = best.geojson_coordinates if best.geojson_coordinates else V1_ROAD_ALIGNED_COORDS

        geojson = _build_segmented_geojson(coords, best.max_slope_percent)
        step_pins = _build_step_pins(best, coords)
        courses = _build_course_list(agent_result)

        course_plans: Dict[str, Any] = {}
        if agent_result.all_scored_candidates:
            for scored in agent_result.all_scored_candidates:
                cand = scored.candidate
                cand_coords = cand.geojson_coordinates if cand.geojson_coordinates else coords
                course_plans[cand.route_id] = {
                    "route": _build_segmented_geojson(cand_coords, cand.max_slope_percent),
                    "stepPins": _build_step_pins(cand, cand_coords),
                }

        resp_data = {
            "request_id": request_id,
            "courses": courses,
            "geojson": geojson,
            "step_pins": step_pins,
            "course_plans": course_plans,
            "briefing": agent_result.briefing_message,
            "summary": agent_result.briefing_message,
            "score": agent_result.best_score,
            "is_live_server": True,
            "weather": agent_result.weather_context,
        }
        if park_mode:
            resp_data["route_validation"] = validations
            resp_data["validated_park_id"] = selected_park
        logger.info(json.dumps({"event": "walk_plan_completed", "request_id": request_id,
                                "park_id": selected_park, "route_id": best.route_id, "status": 200}, ensure_ascii=False))
        if matched_parking:
            resp_data["parking_lot"] = matched_parking

        return resp_data
    except RoutePlanningError as exc:
        logger.warning(json.dumps({"event": "walk_plan_failed", "request_id": request_id,
                                   "park_id": selected_park, "code": exc.code, "status": 422}, ensure_ascii=False))
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


@app.get("/api/v1/community/feed")
def get_community_feed():
    """공유된 안심 코스 피드 목록 조회 (Supabase DB 우선, 인메모리 자동 폴백)."""
    return {
        "feeds": community_repo.get_feeds(),
        "is_supabase": community_repo.is_connected(),
    }


def _fallback_heat_risk_response(lat: float, lon: float) -> Dict[str, Any]:
    """기상청 호출이 불가능할 때 쓰는 고정 기온 곡선 기반 추정 (실제 날씨가 아님)."""
    import datetime
    import math

    now_hour = datetime.datetime.now().hour
    hourly = []
    golden_hours = []

    for h in range(24):
        air_temp = round(26.5 + 4.5 * math.cos(((h - 14) / 12) * math.pi), 1)
        if 10 <= h <= 15:
            sky = "clear"
        elif 6 <= h <= 18:
            sky = "partly_cloudy"
        else:
            sky = "clear"
        dto = determine_heat_risk_dto(hour=h, air_temp=air_temp, sky=sky)
        hourly.append(dto.model_dump() if hasattr(dto, "model_dump") else dto.dict())
    # 6시~22시 사이 안전 골든타임 블록 추출 (1.5~2시간 슬롯 최적화)
    safe_blocks = []
    block_start = None
    for h in range(6, 23):
        is_safe = hourly[h]["is_golden_time"] if h < len(hourly) else False
        if is_safe:
            if block_start is None:
                block_start = h
        else:
            if block_start is not None:
                safe_blocks.append((block_start, h))
                block_start = None
    if block_start is not None:
        safe_blocks.append((block_start, 22))

    chosen_slot = None
    # 1) 현재 진행 중인 골든타임 블록이 있는가?
    for b_start, b_end in safe_blocks:
        if b_start <= now_hour < b_end:
            chosen_slot = (b_start, min(b_end, b_start + 2))
            break
    # 2) 오늘 앞으로 다가올 가장 가까운 골든타임 블록이 있는가?
    if not chosen_slot:
        for b_start, b_end in safe_blocks:
            if b_start > now_hour:
                chosen_slot = (b_start, min(b_end, b_start + 2))
                break
    # 3) 내일 첫 번째 골든타임 블록
    if not chosen_slot and safe_blocks:
        first = safe_blocks[0]
        chosen_slot = (first[0], min(first[1], first[0] + 2))

    if chosen_slot:
        golden_window = f"{chosen_slot[0]:02d}:00 ~ {chosen_slot[1]:02d}:00"
    else:
        golden_window = "18:00 ~ 20:00"

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
        "notice": "본 지수는 기상청 예보 모델 기반 추정치입니다.",
        "coordinates": {"lat": lat, "lon": lon},
        "data_source": "fallback_estimate",
        "insolation_source": None,
        "attribution": None,
        "golden_time_window_day": "today",
        "grid": None,
        "bases": {},
        "warnings": ["실시간 기상 정보를 가져오지 못해 고정 기온 곡선으로 추정한 값입니다."],
    }


def _live_heat_risk_response(lat: float, lon: float) -> Dict[str, Any]:
    """기상청 실황·예보와 Open-Meteo 일사량으로 만든 응답. 실패하면 고정 곡선 추정으로 대체한다."""
    try:
        return build_heat_risk_response(lat, lon)
    except (KmaApiError, ValueError, OSError) as exc:
        logger.warning("실시간 날씨 조회 실패, 고정 곡선 추정으로 대체합니다: %s", exc)
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

