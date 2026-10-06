"""[US-C1, US-C2] 모바일 인터페이스 Polyline 색상 분기 및 백그라운드 핸즈프리 음성 길 안내 TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-C1] React Native Maps 기반 구간별 색상 분기 경로 시각화:
  - 🌿 완만/그늘길: 초록 (#10B981)
  - 🏢 일반 보도/도로: 파랑 (#3B82F6)
  - 🏃 탄성포장: 주황 (#F97316)
  - ⚠️ 높은 턱/급경사/위험: 빨강 (#EF4444)
  - 지도 위 시작/경유/도착 핀 마커 및 요약 카드 메타데이터 검증
- [US-C2] 시선 해방(Eyes-Free) 백그라운드 핸즈프리 음성 길 안내:
  - Android Foreground Service 무중단 백그라운드 GPS 위치 수신
  - OSRM 스텝 기반 회전 30m 전 expo-speech TTS 사전 브리핑 ("50m 앞 완만한 길입니다. 우회전하세요")
  - 경로 40m 이상 이탈 감지 시 음성 재탐색 알림 트리거
"""

import pytest
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


# ==========================================
# 도메인 모델 및 핵심 로직
# ==========================================

def get_segment_polyline_color(
    surface_type: str,
    slope_percent: float = 0.0,
    is_shade: bool = False,
    is_hazard: bool = False
) -> str:
    """[US-C1] 노면 및 보행 환경에 따른 React Native Maps Polyline 분기 색상 반환."""
    # 1. 위험 또는 급경사(> 8%)
    if is_hazard or slope_percent > 8.0:
        return "#EF4444"  # 빨강 (주의/위험)

    # 2. 탄성포장
    if surface_type == "rubber":
        return "#F97316"  # 주황 (탄성포장)

    # 3. 완만(<= 5%) 또는 그늘길 또는 흙/잔디길
    if is_shade or surface_type in ["dirt", "grass"] or slope_percent <= 3.0:
        return "#10B981"  # 초록 (완만/그늘/부드러움)

    # 4. 일반 보도/아스팔트
    return "#3B82F6"  # 파랑 (일반 보도)


class NavigationStep(BaseModel):
    """OSRM / ORS 턴바이턴 내비게이션 스텝 DTO."""
    step_index: int
    instruction: str
    voice_brief: str
    distance_to_turn_m: float
    is_hazard_warning: bool = False


class VoiceNavigationEngine:
    """[US-C2] 백그라운드 핸즈프리 음성 길 안내 엔진."""

    TURN_BRIEF_DISTANCE_THRESHOLD_M = 30.0  # 회전 30m 전 알림
    DEVIATION_ALERT_THRESHOLD_M = 40.0     # 경로 40m 이탈 시 재탐색 알림

    @classmethod
    def evaluate_step_voice_brief(cls, step: NavigationStep) -> Optional[str]:
        """현재 턴 지점까지 남은 거리에 따른 TTS 음성 송출 판단."""
        if step.distance_to_turn_m <= cls.TURN_BRIEF_DISTANCE_THRESHOLD_M:
            return step.voice_brief
        return None

    @classmethod
    def check_route_deviation(cls, distance_from_polyline_m: float) -> Dict[str, Any]:
        """GPS 위치의 경로 이탈 거리 감지 및 재탐색 음성 알림 생성."""
        is_deviated = distance_from_polyline_m >= cls.DEVIATION_ALERT_THRESHOLD_M
        alert_message = None
        if is_deviated:
            alert_message = "경로를 벗어났습니다. 안전한 새 경로를 탐색합니다."

        return {
            "is_deviated": is_deviated,
            "deviation_distance_m": distance_from_polyline_m,
            "voice_alert": alert_message
        }


# ==========================================
# 테스트 스위트
# ==========================================

class TestPolylineColorSegmentation:
    """[US-C1] React Native Maps Polyline 구간별 색상 분기 테스트."""

    def test_dirt_and_grass_surface_colored_green(self):
        """부드러운 흙길 및 잔디길은 초록색(#10B981)으로 매핑되어야 함."""
        color_dirt = get_segment_polyline_color("dirt", slope_percent=2.0)
        color_grass = get_segment_polyline_color("grass", slope_percent=1.5)
        assert color_dirt == "#10B981"
        assert color_grass == "#10B981"

    def test_rubber_surface_colored_orange(self):
        """탄성포장 노면은 주황색(#F97316)으로 매핑되어야 함."""
        color_rubber = get_segment_polyline_color("rubber", slope_percent=2.0)
        assert color_rubber == "#F97316"

    def test_standard_paved_road_colored_blue(self):
        """일반 보도블록/아스팔트 구간은 파란색(#3B82F6)으로 매핑되어야 함."""
        color_paved = get_segment_polyline_color("paved", slope_percent=4.5)
        color_asphalt = get_segment_polyline_color("asphalt", slope_percent=4.0)
        assert color_paved == "#3B82F6"
        assert color_asphalt == "#3B82F6"

    def test_hazard_or_steep_slope_colored_red(self):
        """높은 턱 장애물 또는 8% 초과 급경사는 빨간색(#EF4444)으로 주의 강조되어야 함."""
        color_hazard = get_segment_polyline_color("paved", is_hazard=True)
        color_steep = get_segment_polyline_color("paved", slope_percent=9.2)
        assert color_hazard == "#EF4444"
        assert color_steep == "#EF4444"


class TestEyesFreeVoiceNavigation:
    """[US-C2] 시선 해방 백그라운드 핸즈프리 음성 내비게이션 테스트."""

    def test_voice_brief_triggered_within_30m(self):
        """회전 지점 25m 전 도달 시 사전 음성 브리핑이 정상 송출되는지 검증."""
        step = NavigationStep(
            step_index=1,
            instruction="우회전하세요",
            voice_brief="50m 앞 완만한 흙길입니다. 우회전하세요",
            distance_to_turn_m=25.0
        )
        brief = VoiceNavigationEngine.evaluate_step_voice_brief(step)
        assert brief is not None
        assert "50m 앞 완만한 흙길입니다. 우회전하세요" in brief

    def test_voice_brief_silent_when_far_from_turn(self):
        """회전 지점 60m 전에는 음성이 침묵하여 견주의 산책 몰입을 방해하지 않는지 검증."""
        step = NavigationStep(
            step_index=1,
            instruction="우회전하세요",
            voice_brief="50m 앞 완만한 흙길입니다. 우회전하세요",
            distance_to_turn_m=60.0
        )
        brief = VoiceNavigationEngine.evaluate_step_voice_brief(step)
        assert brief is None

    def test_route_deviation_triggers_reroute_voice_alert(self):
        """경로에서 45m 이탈 시 재탐색 안내 음성이 정상 발동하는지 검증."""
        result = VoiceNavigationEngine.check_route_deviation(distance_from_polyline_m=45.0)
        assert result["is_deviated"] is True
        assert "경로를 벗어났습니다" in result["voice_alert"]

    def test_within_route_tolerance_does_not_trigger_deviation(self):
        """경로에서 15m 오차(GPS 통상 드리프트) 범위 내에서는 이탈 경고를 울리지 않는지 검증."""
        result = VoiceNavigationEngine.check_route_deviation(distance_from_polyline_m=15.0)
        assert result["is_deviated"] is False
        assert result["voice_alert"] is None
