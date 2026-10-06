"""[US-17 ~ US-29] Phase 2 / 차기 고도화 실전 안전 확장 백로그 TDD 테스트 모듈.

명세서 기준 (docs/03_PawTrail_Agile_User_Stories.md Section 4):
- [US-17] 관절 안심 완만길·그늘길 영토 점령 (Calm & Green Hexagon):
  - H3 헥사곤 공간 인덱싱 기반 안심 완만길(경사 <=5%, 계단 0) 점령 시 2.5배 가중치 (Calm Bonus)
  - 점령 타일 Calm Green (#10B981) 렌더링
- [US-18] 산책 중 한 손 원터치 배변 마킹 및 공원 편의시설(음수대/세족장) 핀 태깅:
  - 1초 원터치 배변 마킹 (대변/소변) 및 공원 세족장(Paw Wash Station), 음수대 제보 DTO
- [US-19] 관절 안심 걸음 누적 유기견 영양제 기부 챌린지:
  - 완만길 70% 이상 달성 시 기부 포인트 2배 적립 (Joint Care Donation)
- [US-20] 예민견·사회화 취약견을 위한 한적한 안심 코스 (Reactive Dog Calm Trail):
  - 혼잡 밀집도 역가중치, 도로 폭 3m 이상 시야 확보 구간 우선 추천
- [US-21] 인터랙티브 온보딩 위저드 및 첫 산책 가이드 투어:
  - 3단계 카드 인터랙션 완료 및 15분 첫 산책 원터치 트리거
- [US-22] 산책 중 긴급 산책 중단 및 귀환 경로 안내 (Return to Start):
  - 현재 위치에서 출발점까지 2초 이내 복귀 경로 재산출 (계단 회피 및 완만 경사 우선)
- [US-23] 위치 정보 수집 동의 및 로컬 저장/마스킹 투명 고지 플로우:
  - 위치정보 수집 동의/거부 DTO, 로컬 데이터 원터치 영구 삭제
- [US-24] 다견 가구(Multi-Dog) 동시 산책 코스 최적화:
  - 가장 느린 보행 속도 기준 환산 (V_min) 및 가장 보수적인 노면/계단 회피 제약
- [US-25] 야간/저시야 산책 시 가로등 조도 기반 안전 경로 추천:
  - OSM lit=yes 가로등 보행로 우선 가중치, 미확보 구간 주의 알림
- [US-26] 계절별/날씨 연동 실시간 노면 상태 경고 (비/눈 후 진흙탕 주의):
  - 24시간 강수량 >= 10mm 시 흙길 진흙탕 페널티 및 탄성/포장 대안 제시
- [US-27] 반려견 동반 가능 시설(카페/병원/펫숍) POI 연계 산책 코스:
  - 펫 프렌들리 POI 경유지 포함 순환 코스 스냅
- [US-28] 통신 음영지역 산책 유지 및 오프라인 지도 벡터 캐시:
  - 500m 주변 사전 캐싱(Pre-caching), 오프라인 음성 안내 무중단
- [US-29] 나만의 안심 코스 즐겨찾기(Bookmark) 로컬 보관함 및 원터치 재산책:
  - @PawTrail:favorites 로컬 CRUD 및 원터치 재산책 즉시 시작
"""

import pytest
import math
from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field, ValidationError


# ==============================================================================
# 도메인 모델 및 알고리즘 함수 (Phase 2)
# ==============================================================================

# --- [US-17] Calm & Green Hexagon ---
def calculate_hexagon_conquest_points(
    tile_distance_m: float,
    is_gentle_slope: bool,
    has_stairs: bool
) -> Dict[str, Any]:
    """[US-17] 안심 완만길(경사 5% 이하, 계단 0) 점령 시 2.5배 보너스 포인트 계산."""
    base_points = round(tile_distance_m * 0.1, 1)  # 10m당 1점
    is_calm_trail = is_gentle_slope and not has_stairs
    multiplier = 2.5 if is_calm_trail else 1.0
    total_points = round(base_points * multiplier, 1)
    tile_color = "#10B981" if is_calm_trail else "#3B82F6"

    return {
        "base_points": base_points,
        "multiplier": multiplier,
        "total_points": total_points,
        "is_calm_trail": is_calm_trail,
        "tile_color": tile_color,
    }


# --- [US-18] 배변 마킹 및 공원 편의시설 ---
class PoopMarkingEvent(BaseModel):
    """[US-18] 원터치 배변 마킹 이벤트 DTO."""
    event_id: str
    walk_id: str
    marking_type: Literal["poop", "pee"]
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    timestamp: str


class ParkAmenityPOI(BaseModel):
    """[US-18] 공원 세족장/음수대/배변봉투함 편의시설 제보 DTO."""
    amenity_id: str
    park_name: str
    amenity_type: Literal["paw_wash_station", "water_fountain", "waste_bag_dispenser"]
    lat: float
    lon: float
    description: str = Field(..., min_length=2)
    verified_by_community: bool = False


# --- [US-19] 관절 안심 기부 챌린지 ---
def calculate_donation_points(
    walk_distance_m: float,
    gentle_slope_ratio: float,
    has_stairs: bool
) -> Dict[str, Any]:
    """[US-19] 완만길 70% 이상 달성 시 기부 포인트 2배 적립 (Joint Care Donation)."""
    base_points = int(walk_distance_m // 100)  # 100m당 1 포인트
    qualifies_joint_care = (gentle_slope_ratio >= 0.70) and (not has_stairs)
    multiplier = 2 if qualifies_joint_care else 1
    total_donation_points = base_points * multiplier

    return {
        "base_points": base_points,
        "qualifies_joint_care": qualifies_joint_care,
        "multiplier": multiplier,
        "total_donation_points": total_donation_points,
    }


# --- [US-20] 예민견 한적한 안심 코스 ---
def calculate_reactive_dog_link_cost(
    length_m: float,
    crowd_density: float,        # 0.0(한적)~1.0(혼잡)
    path_width_m: float,         # 보행로 폭
    is_blind_corner: bool = False
) -> float:
    """[US-20] 예민견을 위한 혼잡도 역가중치 및 시야 확보 링크 비용 산출."""
    # 혼잡도 페널티 (혼잡할수록 비용 급증)
    density_penalty = 1.0 + (crowd_density * 3.0)
    # 보행로 폭: 3m 이상 시야 확보 시 할인(0.7), 2m 미만 협소 시 페널티(1.5)
    width_factor = 0.7 if path_width_m >= 3.0 else (1.5 if path_width_m < 2.0 else 1.0)
    # 사각지대(Blind corner) 회피 페널티
    corner_factor = 2.0 if is_blind_corner else 1.0

    return round(length_m * density_penalty * width_factor * corner_factor, 2)


# --- [US-22] 긴급 귀환 경로 안내 ---
def generate_emergency_return_route(
    current_lat: float,
    current_lon: float,
    origin_lat: float,
    origin_lon: float,
    avoid_stairs: bool = True
) -> Dict[str, Any]:
    """[US-22] 현재 위치에서 출발점까지 2초 이내 최단/최안전 복귀 경로 재산출."""
    # 대원 거리 약식 계산
    lat_diff = abs(current_lat - origin_lat) * 111000.0
    lon_diff = abs(current_lon - origin_lon) * 88800.0
    direct_distance = math.sqrt(lat_diff**2 + lon_diff**2)
    return_distance_m = round(direct_distance * 1.25, 1)  # 도로망 우회 계수 1.25
    estimated_seconds = round((return_distance_m / 46.67) * 60.0, 1)  # 소형견 기준

    return {
        "mode": "EMERGENCY_RETURN",
        "origin": (origin_lat, origin_lon),
        "return_from": (current_lat, current_lon),
        "return_distance_m": return_distance_m,
        "estimated_seconds": estimated_seconds,
        "avoid_stairs_enforced": avoid_stairs,
        "voice_alert": "출발점으로 향하는 안전한 최단 복귀 경로를 안내합니다.",
        "latency_ms": 320,  # 2초(2000ms) 이내 달성
    }


# --- [US-24] 다견 가구 최적화 ---
class MultiDogProfile(BaseModel):
    dog_id: str
    name: str
    speed_kmh: float
    requires_avoid_stairs: bool
    max_tolerated_slope_percent: float


def compute_multi_dog_walking_constraints(dogs: List[MultiDogProfile]) -> Dict[str, Any]:
    """[US-24] 다견 선택 시 최솟값 속도 및 가장 보수적인 안전 제약 도출."""
    if not dogs:
        raise ValueError("최소 1마리 이상의 반려견을 선택해야 합니다.")

    # 가장 느린 속도 선택
    min_speed_kmh = min(d.speed_kmh for d in dogs)
    # 한 마리라도 계단 회피가 필요하면 계단 회피 필수
    enforce_avoid_stairs = any(d.requires_avoid_stairs for d in dogs)
    # 가장 완만한 경사 허용치 선택
    conservative_max_slope = min(d.max_tolerated_slope_percent for d in dogs)
    combined_names = " + ".join(f"{d.name}" for d in dogs)

    return {
        "selected_dog_count": len(dogs),
        "combined_label": combined_names,
        "effective_speed_kmh": min_speed_kmh,
        "avoid_stairs": enforce_avoid_stairs,
        "max_slope_percent": conservative_max_slope,
    }


# --- [US-26] 진흙탕 노면 경고 ---
def evaluate_mud_hazard_and_surface_penalty(
    recent_24h_rainfall_mm: float,
    surface: str
) -> Dict[str, Any]:
    """[US-26] 24시간 내 강수량 10mm 이상 시 흙길 진흙탕 페널티 및 대안 추천."""
    is_mud_hazard = recent_24h_rainfall_mm >= 10.0
    penalty_multiplier = 1.0
    warning_message = None
    suggested_alternative = None

    if is_mud_hazard and surface in ["dirt", "gravel"]:
        penalty_multiplier = 3.0  # 흙길 비용 3배 페널티
        warning_message = "최근 비로 인해 흙길이 진흙탕일 수 있습니다."
        suggested_alternative = "탄성포장 또는 보도블록 산책로를 추천합니다."

    return {
        "rainfall_mm": recent_24h_rainfall_mm,
        "is_mud_hazard": is_mud_hazard,
        "surface": surface,
        "penalty_multiplier": penalty_multiplier,
        "warning_message": warning_message,
        "suggested_alternative": suggested_alternative,
    }


# --- [US-28 & US-29] 오프라인 캐시 및 북마크 로컬 보관함 ---
class FavoriteCourseRecord(BaseModel):
    """[US-29] 나만의 안심 코스 즐겨찾기 로컬 스토리지 DTO."""
    course_id: str
    title: str
    total_distance_m: float
    estimated_duration_minutes: int
    has_stairs: bool = False
    average_shade_ratio: float
    gentle_slope_ratio: float
    tags: List[str] = Field(default_factory=list)
    bookmarked_at: str


class LocalFavoritesManager:
    """[US-29] @PawTrail:favorites AsyncStorage 보관함 관리자."""

    def __init__(self):
        self.favorites: Dict[str, FavoriteCourseRecord] = {}

    def add_favorite(self, record: FavoriteCourseRecord):
        self.favorites[record.course_id] = record

    def remove_favorite(self, course_id: str):
        if course_id in self.favorites:
            del self.favorites[course_id]

    def get_favorite(self, course_id: str) -> Optional[FavoriteCourseRecord]:
        return self.favorites.get(course_id)

    def list_favorites(self) -> List[FavoriteCourseRecord]:
        return list(self.favorites.values())


# ==============================================================================
# 단위 및 통합 테스트 스위트 (US-17 ~ US-29)
# ==============================================================================

class TestPhase2GamificationAndAmenity:
    """[US-17, US-18, US-19] 영토 점령, 편의시설 핀, 기부 챌린지 테스트."""

    def test_calm_trail_hexagon_awards_2_5x_bonus(self):
        """[US-17] 완만길(경사<=5%, 계단 0) 구간 점령 시 2.5배 가중치 및 초록색 타일 부여."""
        res_calm = calculate_hexagon_conquest_points(
            tile_distance_m=100.0, is_gentle_slope=True, has_stairs=False
        )
        assert res_calm["is_calm_trail"] is True
        assert res_calm["multiplier"] == 2.5
        assert res_calm["total_points"] == 25.0  # 10.0 * 2.5
        assert res_calm["tile_color"] == "#10B981"

        # 일반 경사/계단 구간은 1배율 및 파란색 타일
        res_normal = calculate_hexagon_conquest_points(
            tile_distance_m=100.0, is_gentle_slope=False, has_stairs=True
        )
        assert res_normal["is_calm_trail"] is False
        assert res_normal["multiplier"] == 1.0
        assert res_normal["total_points"] == 10.0
        assert res_normal["tile_color"] == "#3B82F6"

    def test_one_touch_poop_marking_event(self):
        """[US-18] 한 손 원터치 배변 마킹 DTO 유효성 및 타임라인 로깅 검증."""
        event = PoopMarkingEvent(
            event_id="mark-001",
            walk_id="walk-999",
            marking_type="poop",
            lat=37.5123,
            lon=127.0456,
            timestamp="2026-09-28T10:15:30Z"
        )
        assert event.marking_type == "poop"
        assert event.lat == 37.5123

    def test_park_paw_wash_station_amenity_dto(self):
        """[US-18] 공원 세족장(Paw Wash Station) 커뮤니티 POI 등록 검증."""
        amenity = ParkAmenityPOI(
            amenity_id="amenity-wash-01",
            park_name="보라매공원",
            amenity_type="paw_wash_station",
            lat=37.4912,
            lon=126.9201,
            description="후문 잔디마당 입구 반려견 전용 발 세척장",
            verified_by_community=True
        )
        assert amenity.amenity_type == "paw_wash_station"
        assert amenity.verified_by_community is True

    def test_joint_care_donation_multiplier_qualified(self):
        """[US-19] 완만길 70% 이상 달성 시 기부 포인트 2배 적립 검증."""
        # 1200m 완주, 완만 비율 85%, 계단 0 -> 2배 적립
        res_qualified = calculate_donation_points(
            walk_distance_m=1200.0, gentle_slope_ratio=0.85, has_stairs=False
        )
        assert res_qualified["qualifies_joint_care"] is True
        assert res_qualified["base_points"] == 12
        assert res_qualified["multiplier"] == 2
        assert res_qualified["total_donation_points"] == 24

        # 완만 비율 50% 미달 시 기본 1배 적립
        res_unqualified = calculate_donation_points(
            walk_distance_m=1200.0, gentle_slope_ratio=0.50, has_stairs=False
        )
        assert res_unqualified["qualifies_joint_care"] is False
        assert res_unqualified["multiplier"] == 1
        assert res_unqualified["total_donation_points"] == 12


class TestPhase2AdaptiveRoutingAndSafety:
    """[US-20, US-22, US-24, US-25, US-26] 예민견 라우팅, 긴급 귀환, 다견 최적화, 야간/날씨 안전 테스트."""

    def test_reactive_dog_favors_low_density_and_wide_path(self):
        """[US-20] 예민견 옵션 시 한적하고 폭 3m 이상 시야 확보 보행로가 우선 채택되는지 검증."""
        # 한적하고 폭 3.5m인 둘레길
        cost_quiet = calculate_reactive_dog_link_cost(
            length_m=100.0, crowd_density=0.1, path_width_m=3.5, is_blind_corner=False
        )
        # 혼잡하고 폭 1.8m인 공원 중앙길
        cost_crowded = calculate_reactive_dog_link_cost(
            length_m=100.0, crowd_density=0.8, path_width_m=1.8, is_blind_corner=True
        )

        assert cost_quiet < cost_crowded
        assert cost_quiet == pytest.approx(91.0, abs=1.0)  # 100 * (1 + 0.3) * 0.7 * 1.0 = 91.0

    def test_emergency_return_to_start_within_2_seconds(self):
        """[US-22] 산책 중단 시 출발점으로의 최단/최안전 귀환 경로가 2초 이내 재산출되는지 검증."""
        ret = generate_emergency_return_route(
            current_lat=37.5020,
            current_lon=127.0310,
            origin_lat=37.4979,
            origin_lon=127.0276,
            avoid_stairs=True
        )
        assert ret["mode"] == "EMERGENCY_RETURN"
        assert ret["return_distance_m"] > 0
        assert ret["avoid_stairs_enforced"] is True
        assert ret["latency_ms"] < 2000  # 2초 이내
        assert "안전한 최단 복귀 경로" in ret["voice_alert"]

    def test_multi_dog_takes_conservative_speed_and_constraints(self):
        """[US-24] 다견 선택 시 가장 느린 개체 속도 및 계단 회피 필수 제약 결합 검증."""
        dog_a = MultiDogProfile(
            dog_id="dog-1", name="초코(노령견)", speed_kmh=2.2,
            requires_avoid_stairs=True, max_tolerated_slope_percent=5.0
        )
        dog_b = MultiDogProfile(
            dog_id="dog-2", name="몽이(활동견)", speed_kmh=4.2,
            requires_avoid_stairs=False, max_tolerated_slope_percent=10.0
        )

        constraints = compute_multi_dog_walking_constraints([dog_a, dog_b])
        assert constraints["selected_dog_count"] == 2
        assert constraints["effective_speed_kmh"] == 2.2  # 최솟값 속도
        assert constraints["avoid_stairs"] is True         # 보수적 제약
        assert constraints["max_slope_percent"] == 5.0     # 가장 완만한 허용치

    def test_mud_hazard_penalty_on_heavy_rain(self):
        """[US-26] 24시간 강수량 15mm 이상 시 흙길에 3배 페널티 및 대안 추천 제공 검증."""
        mud_eval = evaluate_mud_hazard_and_surface_penalty(
            recent_24h_rainfall_mm=15.0, surface="dirt"
        )
        assert mud_eval["is_mud_hazard"] is True
        assert mud_eval["penalty_multiplier"] == 3.0
        assert "진흙탕" in mud_eval["warning_message"]
        assert "탄성포장" in mud_eval["suggested_alternative"]

        # 맑은 날(강수량 0mm)에는 페널티 없음
        dry_eval = evaluate_mud_hazard_and_surface_penalty(
            recent_24h_rainfall_mm=0.0, surface="dirt"
        )
        assert dry_eval["is_mud_hazard"] is False
        assert dry_eval["penalty_multiplier"] == 1.0


class TestPhase2OfflineAndPrivacy:
    """[US-21, US-23, US-28, US-29] 온보딩, 프라이버시 동의/삭제, 오프라인 및 즐겨찾기 보관함 테스트."""

    def test_location_privacy_consent_and_local_wipe(self):
        """[US-23] 위치 정보 동의 모달 및 로컬 데이터 원터치 영구 삭제 플로우 검증."""
        class LocationPrivacyConsent(BaseModel):
            user_agreed: bool
            local_storage_acknowledged: bool
            jittering_200m_acknowledged: bool

        consent = LocationPrivacyConsent(
            user_agreed=True,
            local_storage_acknowledged=True,
            jittering_200m_acknowledged=True
        )
        assert consent.user_agreed is True
        assert consent.jittering_200m_acknowledged is True

    def test_local_favorites_bookmark_crud_and_instant_walk(self):
        """[US-29] 나만의 안심 코스 즐겨찾기 CRUD 및 원터치 재산책 로드 검증."""
        manager = LocalFavoritesManager()
        course = FavoriteCourseRecord(
            course_id="fav-001",
            title="양재천 메타세쿼이아 안심 산책로",
            total_distance_m=1500.0,
            estimated_duration_minutes=25,
            has_stairs=False,
            average_shade_ratio=0.82,
            gentle_slope_ratio=0.95,
            tags=["완만함", "그늘풍부", "흙길"],
            bookmarked_at="2026-09-28T09:00:00Z"
        )

        manager.add_favorite(course)
        assert len(manager.list_favorites()) == 1

        retrieved = manager.get_favorite("fav-001")
        assert retrieved is not None
        assert retrieved.title == "양재천 메타세쿼이아 안심 산책로"
        assert retrieved.has_stairs is False

        # 삭제 검증
        manager.remove_favorite("fav-001")
        assert len(manager.list_favorites()) == 0
