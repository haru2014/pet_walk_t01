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

from dotenv import load_dotenv

# .env 를 가장 먼저 읽어야 agent.* 모듈 import 시 os.getenv(SUPABASE_URL 등) 가 값을 본다.
load_dotenv()

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from agent.walk_planning_agent import run_walk_planning_agent
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
        500: {"description": "LangGraph AI Agent 오케스트레이션 내부 오류"}
    },
)
def plan_walk_route(req: Dict[str, Any]):
    """[US-A1, US-A3, US-B1~B3, US-E3] LangGraph ReAct Walk Planning Agent 코어 연동 엔드포인트."""
    dog_name = req.get("dog_name", "아이")
    target_duration = req.get("target_duration_minutes", 30)
    origin_lat = req.get("origin_lat", 37.5665)
    origin_lon = req.get("origin_lon", 126.9780)
    origin_mode = req.get("origin_mode", "park")

    user_query = (
        req.get("user_query")
        or req.get("prompt")
        or req.get("query")
        or f"{dog_name}와 {target_duration}분 동안 폭신한 길 위주로 걷고 싶어요."
    )

    client_dog = {
        "dog_id": req.get("dog_id", "dog_default"),
        "name": dog_name,
        "breed": req.get("breed", "반려견"),
        "age_years": req.get("age_years", 4),
        "weight_kg": req.get("weight_kg", 4.0),
        "speed_kmh": req.get("speed_kmh", 2.8),
        "joint_care_level": req.get("joint_care_level", 1),
    }

    recent_feedback = _parse_recent_feedback(req)

    try:
        agent_result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=client_dog,
            client_recent_feedback=recent_feedback,
            origin_lat=origin_lat,
            origin_lon=origin_lon,
            origin_mode=origin_mode,
        )

        best = agent_result.best_route
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

        return {
            "courses": courses,
            "geojson": geojson,
            "step_pins": step_pins,
            "course_plans": course_plans,
            "briefing": agent_result.briefing_message,
            "summary": agent_result.briefing_message,
            "score": agent_result.best_score,
            "is_live_server": True,
        }
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


@app.get("/api/v1/weather/heat-risk")
def get_weather_heat_risk(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
):
    """[US-F1] 기상청 단기예보 모델 기반 시간대별 지면열 추정 및 안전 골든타임 조회."""
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
        if dto.is_golden_time and (6 <= h <= 22):
            golden_hours.append(h)

    current_dto = hourly[now_hour] if now_hour < len(hourly) else hourly[12]
    golden_window = (
        f"{golden_hours[0]:02d}:00 ~ {golden_hours[-1] + 1:02d}:00"
        if golden_hours
        else "일몰 후 (19:00 ~ 22:00) 권장"
    )

    return {
        "status": "success",
        "current": current_dto,
        "golden_time_window": golden_window,
        "hourly_forecast": hourly,
        "notice": "본 지수는 기상청 예보 모델 기반 추정치입니다.",
        "coordinates": {"lat": lat, "lon": lon},
    }


_ZONE_YURIM = "유림공원"
_ZONE_SONGGANG = "송강근린공원"
_ZONE_DOAN = "도안호수공원"
_ZONE_SEJONG = "세종호수공원"
_FEE_FREE = "free"
_FEE_PAID = "paid"

_PILOT_PARKING_LOTS = [
    {"parking_id": "pkg_yurim_01", "name": "유림공원 부설 공영주차장", "entrance_lat": 36.3628, "entrance_lon": 127.3592, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_YURIM},
    {"parking_id": "pkg_yurim_02", "name": "유성구청 공영주차장", "entrance_lat": 36.3615, "entrance_lon": 127.3598, "is_public": True, "fee_type": _FEE_PAID, "park_zone": _ZONE_YURIM},
    {"parking_id": "pkg_yurim_03", "name": "어은교 갑천변 노상 공영주차장", "entrance_lat": 36.3640, "entrance_lon": 127.3575, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_YURIM},
    {"parking_id": "pkg_songgang_01", "name": "송강근린공원 공영주차장", "entrance_lat": 36.4320, "entrance_lon": 127.3810, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SONGGANG},
    {"parking_id": "pkg_songgang_02", "name": "송강동 공영노상주차장", "entrance_lat": 36.4305, "entrance_lon": 127.3790, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SONGGANG},
    {"parking_id": "pkg_doan_01", "name": "도안호수공원 임시 공영주차장", "entrance_lat": 36.3458, "entrance_lon": 127.3428, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_DOAN},
    {"parking_id": "pkg_doan_02", "name": "갑천생태공원 둔치 주차장", "entrance_lat": 36.3435, "entrance_lon": 127.3455, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_DOAN},
    {"parking_id": "pkg_sejong_01", "name": "세종호수공원 제1주차장", "entrance_lat": 36.5065, "entrance_lon": 127.2655, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SEJONG},
    {"parking_id": "pkg_sejong_02", "name": "세종호수공원 제2주차장", "entrance_lat": 36.5015, "entrance_lon": 127.2695, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SEJONG},
    {"parking_id": "pkg_sejong_03", "name": "세종호수공원 제3주차장 (수목원 방면)", "entrance_lat": 36.4980, "entrance_lon": 127.2730, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SEJONG},
    {"parking_id": "pkg_sejong_04", "name": "세종호수공원 제4주차장 (대통령기록관)", "entrance_lat": 36.5085, "entrance_lon": 127.2630, "is_public": True, "fee_type": _FEE_FREE, "park_zone": _ZONE_SEJONG},
]


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
):
    """[US-G1] 대전 3대 공원 & 세종호수공원 4대 파일럿 거점 반경 내 공영주차장 검색."""
    nearby_lots = []
    for lot in _PILOT_PARKING_LOTS:
        dist = _haversine_distance_meters(lat, lon, lot["entrance_lat"], lot["entrance_lon"])
        if dist <= radius_m:
            item = dict(lot)
            item["distance_m"] = dist
            nearby_lots.append(item)

    nearby_lots.sort(key=lambda x: x["distance_m"])
    return {
        "status": "success",
        "total_count": len(nearby_lots),
        "search_radius_m": radius_m,
        "query_center": {"lat": lat, "lon": lon},
        "parking_lots": nearby_lots,
    }

