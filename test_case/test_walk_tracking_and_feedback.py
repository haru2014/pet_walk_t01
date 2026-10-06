"""[US-E1, US-E2, US-H1] 산책 기록 로컬 저장, 체감 피드백 수집 및 EAS OTA / CBT 검증 TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-E1] 백그라운드 GPS 위치 추적 및 실산책 경로 로컬 저장 (Local-First):
  - 상세 보행 GPS 궤적(위경도 배열)과 자택 위치는 서버로 절대 전송하지 않고 AsyncStorage(@PawTrail:walk_history)에만 영구 보관
  - 최근 100회 산책 기록 보관 관리 (FIFO 롤링)
  - 네트워크 차단(비행기 모드) 상태에서도 100% 정상 저장 검증
- [US-E2] 산책 종료 후 보행 체감 피드백 수집 및 로컬 통계:
  - 완주 인포그래픽 카드 (총 거리, 소요 시간, 완만 구간 비율)
  - 3초 원터치 간편 피드백 태그(완만함, 그늘, 발 편함) 및 5점 만족도 슬라이더
- [US-H1] EAS Build 1회 배포, EAS Update 무선 OTA 및 5인 CBT:
  - expo-updates 무선 OTA 매니페스트 DTO 검증
  - 5인 견주(소형, 중형, 대형, 노령견) CBT 피드백 집계 및 가중치 튜닝 알고리즘
"""

import pytest
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field, ValidationError


# ==========================================
# 도메인 모델 및 핵심 로직
# ==========================================

class WalkPoint(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    timestamp: str


class LocalWalkRecord(BaseModel):
    """[US-E1] 로컬 AsyncStorage (@PawTrail:walk_history) 산책 기록 스키마."""
    walk_id: str
    dog_id: str
    total_distance_m: float = Field(..., gt=0)
    duration_minutes: int = Field(..., ge=1)
    gps_track: List[WalkPoint] = Field(..., min_length=2)
    gentle_slope_ratio: float = Field(..., ge=0.0, le=1.0)
    preferred_surface_ratio: float = Field(..., ge=0.0, le=1.0)
    is_synced_to_cloud: bool = False  # 상세 궤적은 로컬 전용, 클라우드 동기화 배제


class WalkFeedbackPayload(BaseModel):
    """[US-E2] 산책 종료 후 3초 원터치 체감 피드백 DTO."""
    walk_id: str
    satisfaction_rating: int = Field(..., ge=1, le=5, description="1~5점 만족도")
    tags: List[str] = Field(default_factory=list, description="간편 태그 (gentle, shady, paw_friendly)")
    comment: Optional[str] = Field(None, max_length=200)


class EasUpdateManifest(BaseModel):
    """[US-H1] EAS Update 무선 OTA 매니페스트 스키마."""
    update_id: str
    runtime_version: str = "exposdk:51.0.0"
    channel: str = "production"
    bundle_url: str
    created_at: str
    is_critical_hotfix: bool = False


class LocalWalkHistoryManager:
    """[US-E1] 최근 100회 산책 기록 로컬 관리자."""
    MAX_HISTORY_COUNT = 100

    def __init__(self):
        self.history: List[LocalWalkRecord] = []

    def save_walk(self, record: LocalWalkRecord):
        self.history.append(record)
        # 100회 초과 시 가장 오래된 기록 제거 (FIFO)
        if len(self.history) > self.MAX_HISTORY_COUNT:
            self.history.pop(0)

    def get_walk_count(self) -> int:
        return len(self.history)


def calibrate_routing_weights_from_cbt(cbt_survey_results: List[Dict[str, Any]]) -> Dict[str, float]:
    """[US-H1] 5인 CBT 설문 피드백 기반 가중치 튜닝 알고리즘."""
    avg_rating = sum(r["rating"] for r in cbt_survey_results) / len(cbt_survey_results)
    stairs_complaints = sum(1 for r in cbt_survey_results if r.get("stairs_experienced", False))
    steep_complaints = sum(1 for r in cbt_survey_results if r.get("too_steep", False))

    discount_factor = 0.45
    slope_penalty = 3.0

    # 평점이 3.5 미만이거나 계단 불만이 있는 경우 안전 가중치 강화
    if avg_rating < 3.5 or stairs_complaints > 0:
        discount_factor = 0.40  # 선호 노면 할인율 강화
    if steep_complaints >= 2:
        slope_penalty = 4.0     # 경사도 페널티 상향

    return {
        "pref_discount_factor": discount_factor,
        "slope_penalty_factor": slope_penalty,
        "avg_cbt_rating": round(avg_rating, 2)
    }


# ==========================================
# 테스트 스위트
# ==========================================

class TestLocalWalkTrackingAndHistory:
    """[US-E1] 백그라운드 GPS 로컬 저장 및 100회 보관 한도 테스트."""

    def test_local_walk_record_saved_with_gps_track(self):
        """GPS 궤적이 포함된 산책 기록이 로컬 스키마를 올바르게 통과하는지 검증."""
        track = [
            WalkPoint(lat=37.4979, lon=127.0276, timestamp="2026-09-21T18:00:00Z"),
            WalkPoint(lat=37.4985, lon=127.0285, timestamp="2026-09-21T18:05:00Z"),
            WalkPoint(lat=37.4979, lon=127.0276, timestamp="2026-09-21T18:25:00Z"),
        ]
        record = LocalWalkRecord(
            walk_id="walk-001",
            dog_id="dog-maltese-001",
            total_distance_m=1250.0,
            duration_minutes=25,
            gps_track=track,
            gentle_slope_ratio=0.85,
            preferred_surface_ratio=0.68,
            is_synced_to_cloud=False
        )
        assert record.total_distance_m == 1250.0
        assert len(record.gps_track) == 3
        assert record.is_synced_to_cloud is False

    def test_local_history_capped_at_100_walks(self):
        """105회 연속 산책 기록 저장 시 최근 100회만 유지되고 초과분이 정상 제거되는지 검증."""
        manager = LocalWalkHistoryManager()
        track = [
            WalkPoint(lat=37.5, lon=127.0, timestamp="2026-09-21T10:00:00Z"),
            WalkPoint(lat=37.501, lon=127.001, timestamp="2026-09-21T10:20:00Z"),
        ]

        for i in range(105):
            rec = LocalWalkRecord(
                walk_id=f"walk-{i:03d}",
                dog_id="dog-001",
                total_distance_m=1000.0,
                duration_minutes=20,
                gps_track=track,
                gentle_slope_ratio=0.8,
                preferred_surface_ratio=0.7
            )
            manager.save_walk(rec)

        assert manager.get_walk_count() == 100
        # 가장 오래된 기록(walk-000 ~ 004)은 제거되고 walk-005가 첫 번째여야 함
        assert manager.history[0].walk_id == "walk-005"
        assert manager.history[-1].walk_id == "walk-104"


class TestWalkFeedbackCollection:
    """[US-E2] 완주 후 3초 체감 피드백 수집 테스트."""

    def test_valid_feedback_payload(self):
        """정상적인 만족도 5점 및 간편 태그 피드백 DTO 유효성 검증."""
        feedback = WalkFeedbackPayload(
            walk_id="walk-001",
            satisfaction_rating=5,
            tags=["gentle", "shady", "paw_friendly"],
            comment="계단이 없어 말티즈 아이가 편하게 걸었습니다."
        )
        assert feedback.satisfaction_rating == 5
        assert len(feedback.tags) == 3

    @pytest.mark.parametrize("invalid_rating", [0, 6, -1, 10])
    def test_invalid_rating_rejected(self, invalid_rating):
        """1~5점 범위를 벗어난 만족도 평점 거부 검증."""
        with pytest.raises(ValidationError):
            WalkFeedbackPayload(
                walk_id="walk-001",
                satisfaction_rating=invalid_rating
            )


class TestEasOtaAndCbtTuning:
    """[US-H1] EAS Update 무선 OTA 및 5인 CBT 가중치 튜닝 테스트."""

    def test_eas_update_manifest_validation(self):
        """EAS Update 무선 OTA 배포 매니페스트 DTO 검증."""
        manifest = EasUpdateManifest(
            update_id="update-20260921-hotfix",
            runtime_version="exposdk:51.0.0",
            channel="production",
            bundle_url="https://u.expo.dev/pawtrail-bundle-v1.js",
            created_at="2026-09-21T18:00:00Z",
            is_critical_hotfix=True
        )
        assert manifest.runtime_version == "exposdk:51.0.0"
        assert manifest.is_critical_hotfix is True

    def test_cbt_survey_tuning_adapts_weights(self):
        """5인 CBT 중 급경사 불만 2건 발생 시 경사 페널티가 3.0에서 4.0으로 상향 튜닝되는지 검증."""
        cbt_results = [
            {"user_id": "tester-1", "rating": 4, "stairs_experienced": False, "too_steep": False},
            {"user_id": "tester-2", "rating": 3, "stairs_experienced": False, "too_steep": True},
            {"user_id": "tester-3", "rating": 3, "stairs_experienced": False, "too_steep": True},
            {"user_id": "tester-4", "rating": 5, "stairs_experienced": False, "too_steep": False},
            {"user_id": "tester-5", "rating": 4, "stairs_experienced": False, "too_steep": False},
        ]
        calibrated = calibrate_routing_weights_from_cbt(cbt_results)
        assert calibrated["avg_cbt_rating"] == 3.8
        assert calibrated["slope_penalty_factor"] == 4.0  # 급경사 불만 2건으로 페널티 상향


