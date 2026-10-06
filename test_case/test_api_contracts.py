"""[US-G2 & REST API] 200m 공간 마스킹 및 FastAPI 백엔드 REST API v1 입출력 계약(Contract) TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-G2] 간편 이메일 가입 및 코스 공유 시 출발지/도착지 200m 공간 마스킹:
  - 코스 커뮤니티 공개 시 출발지 및 도착지 반경 200m 구간 좌표를 절단/지터링(Spatial Jittering)하여 자택 노출 방지
  - 커뮤니티 피드 DTO (공유자 자택 마스킹, 코스 요약, 별점 후기)
- FastAPI v1 REST API DTO 계약 규격:
  - POST /api/v1/walk/plan (최적 코스 생성 - 계단 회피, 경사도, 그늘, 음성 스텝 동봉)
  - POST /api/v1/walk/reroute (현장 위험 감지 시 안전 우회 재탐색)
  - POST /api/v1/surface/inspect (현장 위험물/공원안내판 시각 판독)
  - POST /api/v1/community/share (200m 마스킹 완주 코스 공유)
  - GET /api/v1/community/feed (공유 안심 코스 피드 조회)
  - POST /api/v1/hazards (공공 위험 제보)
"""

import pytest
import math
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError


# ==========================================
# US-G2 200m 공간 마스킹(Spatial Jittering) 알고리즘
# ==========================================

def calculate_haversine_distance_m(coord1: tuple, coord2: tuple) -> float:
    """두 위경도 좌표 간의 대원 거리(미터) 연산."""
    lat1, lon1 = coord1
    lat2, lon2 = coord2
    R = 6371000.0  # 지구 반지름 (m)

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


def apply_spatial_masking_to_course(
    coordinates: List[List[float]],
    masking_radius_m: float = 200.0
) -> Dict[str, Any]:
    """[US-G2] 출발지 및 도착지 반경 200m 공간 절단 및 지터링 마스킹 함수."""
    if len(coordinates) < 4:
        return {
            "masked_coordinates": [],
            "is_masked": False,
            "error": "경로 좌표가 너무 짧아 마스킹을 적용할 수 없습니다."
        }

    origin = (coordinates[0][1], coordinates[0][0])       # (lat, lon)
    destination = (coordinates[-1][1], coordinates[-1][0])

    masked_coords = []
    trimmed_start_count = 0
    trimmed_end_count = 0

    # 출발지 200m 이내 제거
    for pt in coordinates:
        curr = (pt[1], pt[0])
        dist_from_origin = calculate_haversine_distance_m(origin, curr)
        if dist_from_origin > masking_radius_m:
            masked_coords.append(pt)
        else:
            trimmed_start_count += 1

    # 도착지 200m 이내 제거 (뒤에서부터)
    final_masked = []
    for pt in reversed(masked_coords):
        curr = (pt[1], pt[0])
        dist_from_dest = calculate_haversine_distance_m(destination, curr)
        if dist_from_dest > masking_radius_m:
            final_masked.append(pt)
        else:
            trimmed_end_count += 1

    final_masked.reverse()

    return {
        "masked_coordinates": final_masked,
        "is_masked": True,
        "trimmed_start_points": trimmed_start_count,
        "trimmed_end_points": trimmed_end_count,
        "masking_radius_m": masking_radius_m
    }


# ==========================================
# REST API v1 DTO 규격
# ==========================================

class NavigationVoiceStep(BaseModel):
    distance_m: float
    instruction: str
    voice_brief: str


class WalkPlanResponseV1(BaseModel):
    """POST /api/v1/walk/plan 응답 DTO."""
    route_id: str
    total_distance_meters: float = Field(..., gt=0)
    estimated_duration_minutes: int = Field(..., ge=10, le=90)
    stairs_avoidance_applied: bool
    stairs_detected_in_route: bool = False
    max_slope_percent: float = Field(..., ge=0.0)
    average_shade_ratio: float = Field(..., ge=0.0, le=1.0)
    navigation_steps: List[NavigationVoiceStep]
    agent_comment: str = Field(..., min_length=5)


class CommunityCourseShareRequest(BaseModel):
    """POST /api/v1/community/share 요청 DTO."""
    user_id: str
    course_title: str = Field(..., min_length=2, max_length=50)
    raw_coordinates: List[List[float]] = Field(..., min_length=4)
    satisfaction_rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class CommunityCourseSummary(BaseModel):
    """GET /api/v1/community/feed 항목 DTO."""
    course_id: str
    title: str
    masked_polyline: List[List[float]]
    distance_m: float
    duration_min: int
    rating: float = Field(..., ge=1.0, le=5.0)
    is_origin_masked: bool = True


# ==========================================
# 테스트 스위트
# ==========================================

class TestSpatialMaskingAlgorithm:
    """[US-G2] 커뮤니티 코스 공유 시 출발지/도착지 200m 공간 마스킹 테스트."""

    def test_200m_spatial_masking_trims_home_coordinates(self):
        """출발지와 도착지 반경 200m 이내의 좌표가 확실히 제거되어 자택이 보호되는지 검증."""
        # 100m 간격으로 직선 이동하는 좌표열 (0m ~ 600m)
        # 위도 0.001도는 약 111m
        coords = [
            [127.0, 37.500],  # 출발지 (자택)
            [127.0, 37.501],  # 약 111m (200m 이내)
            [127.0, 37.502],  # 약 222m (200m 초과 -> 공개 시작)
            [127.0, 37.503],  # 약 333m
            [127.0, 37.504],  # 약 444m
            [127.0, 37.505],  # 약 555m (도착지 반경 이내)
            [127.0, 37.506],  # 도착지 (자택 복귀)
        ]

        result = apply_spatial_masking_to_course(coords, masking_radius_m=200.0)
        assert result["is_masked"] is True
        # 출발지 2개(0m, 111m)와 도착지 2개(555m, 666m)가 잘려나가고 가운데 3개만 남아있어야 함
        assert len(result["masked_coordinates"]) == 3
        # 자택 원점([127.0, 37.500])이 마스킹 결과에 포함되지 않음을 검증
        assert [127.0, 37.500] not in result["masked_coordinates"]
        assert [127.0, 37.506] not in result["masked_coordinates"]


class TestRestApiV1Contracts:
    """FastAPI v1 엔드포인트 입출력 DTO 계약 규격 테스트."""

    def test_walk_plan_response_v1_contract(self):
        """POST /api/v1/walk/plan 응답 DTO 규격 검증."""
        payload = {
            "route_id": "route_local_123",
            "total_distance_meters": 1150.0,
            "estimated_duration_minutes": 24,
            "stairs_avoidance_applied": True,
            "stairs_detected_in_route": False,
            "max_slope_percent": 3.5,
            "average_shade_ratio": 0.71,
            "navigation_steps": [
                {
                    "distance_m": 120.0,
                    "instruction": "직진 후 50m 앞 우회전하세요",
                    "voice_brief": "50m 앞 부드러운 완만길입니다. 우회전하세요"
                },
                {
                    "distance_m": 350.0,
                    "instruction": "그늘 산책로 진입",
                    "voice_brief": "지금부터 300m 동안 시원한 그늘길이 이어집니다"
                }
            ],
            "agent_comment": "초코의 편안한 보행을 위해 계단 없이 완만한(최대 3.5%) 그늘 코스를 준비했습니다."
        }
        res = WalkPlanResponseV1(**payload)
        assert res.route_id == "route_local_123"
        assert res.stairs_avoidance_applied is True
        assert "완만" in res.navigation_steps[0].voice_brief


    def test_community_course_share_and_feed_contract(self):
        """커뮤니티 코스 공유 및 피드 DTO 계약 검증 (US-G2)."""
        share_payload = {
            "user_id": "usr-test-1",
            "course_title": "보라매 흙길 둘레길",
            "raw_coordinates": [[127.0, 37.5], [127.01, 37.51], [127.02, 37.52], [127.03, 37.53]],
            "satisfaction_rating": 5,
            "comment": "완만하고 그늘이 많아요"
        }
        req = CommunityCourseShareRequest(**share_payload)
        assert req.satisfaction_rating == 5

        feed_item_payload = {
            "course_id": "course-99",
            "title": "보라매 흙길 둘레길",
            "masked_polyline": [[127.01, 37.51], [127.02, 37.52]],
            "distance_m": 1200.0,
            "duration_min": 25,
            "rating": 4.8,
            "is_origin_masked": True
        }
        feed = CommunityCourseSummary(**feed_item_payload)
        assert feed.is_origin_masked is True
        assert feed.rating == 4.8

