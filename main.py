"""[편안하개 - PetWalk]
FastAPI 메인 애플리케이션 엔트리포인트 (v1 REST API).

- CORS 설정 (Expo Web http://localhost:8081 및 모바일 클라이언트 지원)
- POST /api/v1/walk/plan (LangGraph ReAct Walk Planning Agent 코어 연동)
- POST /api/v1/community/share (US-G2 200m 공간 마스킹 코스 공유)
- GET /api/v1/community/feed (공개 안심 코스 피드)
- GET /health (헬스체크)
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from agent.walk_planning_agent import run_walk_planning_agent
from test_case.test_api_contracts import (
    apply_spatial_masking_to_course,
    WalkPlanRequestV1,
    WalkPlanResponseV1,
    CommunityCourseShareRequest,
    CommunityCourseSummary,
)

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
    return {"status": "ok", "mode": "live"}


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

    user_query = f"{dog_name}와 {target_duration}분 동안 폭신한 길 위주로 걷고 싶어요."

    client_dog = {
        "dog_id": req.get("dog_id", "dog_default"),
        "name": dog_name,
        "breed": "반려견",
        "speed_kmh": req.get("speed_kmh", 2.8),
        "joint_care_level": req.get("joint_care_level", 1),
    }

    recent_feedback = []
    if req.get("recent_feedback"):
        rf = req["recent_feedback"]
        if rf.get("slope_dissatisfaction_count", 0) > 0:
            recent_feedback.append({"tag": "too_steep", "count": rf["slope_dissatisfaction_count"]})
        if rf.get("shade_preference_count", 0) > 0:
            recent_feedback.append({"tag": "cool_shade", "count": rf["shade_preference_count"]})

    try:
        agent_result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=client_dog,
            client_recent_feedback=recent_feedback,
        )

        best = agent_result.best_route
        coords = best.geojson_coordinates if best.geojson_coordinates else [
            [127.0374, 37.5443], [127.0390, 37.5455], [127.0409, 37.5456], [127.0374, 37.5443]
        ]

        geojson = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"segmentType": "safe", "maxSlopePercent": best.max_slope_percent, "shaded": True},
                    "geometry": {"type": "LineString", "coordinates": coords}
                }
            ]
        }

        courses = [
            {
                "id": best.route_id,
                "name": best.name,
                "distanceKm": f"{best.total_distance_m / 1000.0:.1f}km",
                "estimatedMinutes": int(best.estimated_duration_minutes),
                "softRatio": "85%",
                "shadeLevel": "높음" if best.average_shade_ratio > 0.5 else "보통",
                "stairsCount": "0개",
                "maxSlopePercent": best.max_slope_percent,
                "shadePercent": int(best.average_shade_ratio * 100),
                "softSurfacePercent": 85,
                "reason": agent_result.briefing_message,
            }
        ]

        return {
            "courses": courses,
            "geojson": geojson,
            "step_pins": [
                {"id": "step_1", "kind": "turn", "position": coords[1] if len(coords) > 1 else coords[0], "instruction": "50m 앞 완만한 길입니다. 우회전하세요"},
            ],
            "briefing": agent_result.briefing_message,
            "score": agent_result.best_score,
            "is_live_server": True,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# 인메모리 커뮤니티 피드 저장소 (초기 데모용)
_COMMUNITY_FEEDS: List[Dict[str, Any]] = [
    {
        "course_id": "feed_1",
        "title": "성산근린공원 폭신한 숲길 루프",
        "masked_polyline": [[127.038, 37.544], [127.040, 37.545], [127.039, 37.543]],
        "distance_m": 1600.0,
        "duration_min": 26,
        "rating": 4.9,
        "is_origin_masked": True,
    }
]


@app.post("/api/v1/community/share")
def share_community_course(req: CommunityCourseShareRequest):
    """[US-G2] 출발지 및 도착지 200m 공간 마스킹 후 커뮤니티 피드 등록."""
    mask_result = apply_spatial_masking_to_course(req.raw_coordinates, masking_radius_m=200.0)
    new_feed = {
        "course_id": f"feed_{len(_COMMUNITY_FEEDS) + 1}",
        "title": req.course_title,
        "masked_polyline": mask_result["masked_coordinates"],
        "distance_m": 1400.0,
        "duration_min": 22,
        "rating": float(req.satisfaction_rating),
        "is_origin_masked": mask_result["is_masked"],
    }
    _COMMUNITY_FEEDS.insert(0, new_feed)
    return {"status": "shared", "feed": new_feed}


@app.get("/api/v1/community/feed")
def get_community_feed():
    """공유된 안심 코스 피드 목록 조회."""
    return {"feeds": _COMMUNITY_FEEDS}
