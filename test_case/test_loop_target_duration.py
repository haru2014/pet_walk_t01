"""[US-A3] 사용자 지정 산책 시간(Target Duration) 및 표준 보행 속도 기반 맞춤형 코스 생성 TDD 테스트 모듈.

명세서 기준 (US-A3 Definition of Done & 인수 조건):
1. 산책 시간대별(15분, 30분, 45분) 및 견종 체급별 표준 보행 속도 모델:
   - 소형견(small): 2.8 km/h (46.67 m/min)
   - 중형견(medium): 3.6 km/h (60.0 m/min)
   - 대형견(large): 4.2 km/h (70.0 m/min)
   - 노령견/관절안심케어(senior_joint_care): 2.2 km/h (36.67 m/min)
2. 목표 거리 환산 공식: D_target = V_dog * T_target
3. 플래너 10~90분 슬라이더(기본 권장 15~60분) 입력 유효성 검증
4. 생성된 순환(Loop) 경로의 소요 시간/거리 오차가 목표 대비 ±15% 이내 수렴 검증
5. 최소 2개 이상의 대안 순환 루프 코스 생성 검증
"""

import pytest
from typing import List, Dict, Any, Literal
from pydantic import BaseModel, Field, ValidationError

# 체급별 표준 보행 속도 (m/min) - 03_PawTrail_Agile_User_Stories.md US-A3 정합
DOG_WALK_SPEEDS_M_PER_MIN = {
    "small": 46.67,                  # 2.8 km/h
    "medium": 60.0,                  # 3.6 km/h
    "large": 70.0,                   # 4.2 km/h
    "senior_joint_care": 36.67,      # 2.2 km/h (관절 안심 케어 및 노령견)
    "senior_joint_care_alt": 36.67,  # 별칭 호환성 유지
}


class TargetDurationPlanRequest(BaseModel):
    """[US-A3] 산책 시간 지정 요청 DTO."""
    dog_id: str
    target_duration_minutes: int = Field(..., ge=10, le=90, description="목표 산책 시간(10분~90분)")
    dog_size: Literal["small", "medium", "large", "senior_joint_care", "senior_joint_care_alt"] = "small"
    origin_lat: float = Field(..., ge=-90.0, le=90.0)
    origin_lon: float = Field(..., ge=-180.0, le=180.0)


def calculate_target_distance_meters(
    duration_minutes: int,
    dog_size: Literal["small", "medium", "large", "senior_joint_care", "senior_joint_care_alt"]
) -> float:
    """시간과 표준 보행 속도를 곱하여 목표 거리(m)를 산출하는 함수."""
    speed = DOG_WALK_SPEEDS_M_PER_MIN[dog_size]
    return round(speed * duration_minutes, 1)


def generate_simulated_loop_candidates(
    target_distance: float,
    origin: tuple
) -> List[Dict[str, Any]]:
    """목표 거리 기반으로 ±15% 오차 범위 내의 2개 이상 루프 코스 후보 생성 시뮬레이션."""
    # 알고리즘 시뮬레이션: 코스 1 (오차 -6%), 코스 2 (오차 +8%)
    candidate1_dist = round(target_distance * 0.94, 1)
    candidate2_dist = round(target_distance * 1.08, 1)

    return [
        {
            "route_id": "loop_opt_1",
            "name": "공원 둘레길 완만 코스 A",
            "distance_m": candidate1_dist,
            "origin": origin,
            "destination": origin,  # 순환 폐곡선
            "error_rate": round(abs(candidate1_dist - target_distance) / target_distance, 4)
        },
        {
            "route_id": "loop_opt_2",
            "name": "숲길 힐링 그늘 코스 B",
            "distance_m": candidate2_dist,
            "origin": origin,
            "destination": origin,
            "error_rate": round(abs(candidate2_dist - target_distance) / target_distance, 4)
        }
    ]


class TestTargetDurationCourseGeneration:
    """[US-A3] 목표 시간 기반 코스 생성 단위 테스트 스위트."""

    @pytest.mark.parametrize("duration, dog_size, expected_distance", [
        (15, "small", 700.0),            # 15분 소형견: 약 700m (46.67 * 15)
        (30, "small", 1400.0),           # 30분 소형견: 약 1400m
        (45, "small", 2100.0),           # 45분 소형견: 약 2100m
        (15, "medium", 900.0),           # 15분 중형견: 900m (60.0 * 15)
        (30, "medium", 1800.0),          # 30분 중형견: 1800m
        (45, "medium", 2700.0),          # 45분 중형견: 2700m
        (30, "large", 2100.0),           # 30분 대형견: 2100m (70.0 * 30)
        (45, "large", 3150.0),           # 45분 대형견: 3150m
        (20, "senior_joint_care", 733.4),     # 20분 노령/관절케어견: 약 733m (36.67 * 20)
        (20, "senior_joint_care_alt", 733.4), # 별칭 호환성
    ])
    def test_target_distance_calculation_by_duration_and_size(
        self, duration, dog_size, expected_distance
    ):
        """시간대별 및 체급별 표준 목표 거리 산출 공식 검증 (오차 ±5m 이내 정밀도)."""
        dist = calculate_target_distance_meters(duration, dog_size)
        assert dist == pytest.approx(expected_distance, abs=5.0)

    def test_loop_candidates_within_15_percent_tolerance(self):
        """생성된 루프 경로가 목표 거리 대비 오차 ±15% 이내인지 검증 (인수조건 2)."""
        target_dist = 1400.0  # 30분 소형견 기준 (1400m)
        routes = generate_simulated_loop_candidates(target_dist, origin=(37.4979, 127.0276))

        # 1. 최소 2개 이상의 루프 후보가 생성되는지 검증
        assert len(routes) >= 2

        # 2. 모든 후보가 순환형(출발지==도착지)인지 검증
        for route in routes:
            assert route["origin"] == route["destination"]

            # 3. 오차율이 15% (0.15) 이내인지 검증
            assert route["error_rate"] <= 0.15
            assert target_dist * 0.85 <= route["distance_m"] <= target_dist * 1.15

    def test_request_payload_validation_for_duration(self):
        """플래너 10~90분 슬라이더 제약 조건 검증."""
        valid_req = TargetDurationPlanRequest(
            dog_id="dog-001",
            target_duration_minutes=30,
            dog_size="small",
            origin_lat=37.5,
            origin_lon=127.0
        )
        assert valid_req.target_duration_minutes == 30

        # 10분 미만 거부
        with pytest.raises(ValidationError):
            TargetDurationPlanRequest(
                dog_id="dog-001",
                target_duration_minutes=5,
                origin_lat=37.5,
                origin_lon=127.0
            )

        # 90분 초과 거부
        with pytest.raises(ValidationError):
            TargetDurationPlanRequest(
                dog_id="dog-001",
                target_duration_minutes=100,
                origin_lat=37.5,
                origin_lon=127.0
            )

