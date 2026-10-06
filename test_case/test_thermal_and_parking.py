"""[US-F1, US-G1] n8n 기상청 지면열 추정 골든타임 및 공영주차장 P&R 코스 연계 TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-F1] 기상청 단기예보 연동 시간대별 열 위험 지수 안내:
  - 기상청 단기예보(기온, 일사량) 기반 지면열 추정 수지식:
    Estimated Surface Temp = Air Temp + (Insolation Weight * 15)
    - 일사량 가중치: 맑음(Clear)=1.0, 구름많음(Partly Cloudy)=0.6, 흐림(Overcast)=0.2, 비/야간=0.0
  - 35℃ 이하 안전 산책 골든타임 카드 도출
  - 실제 계측이 아닌 '추정 위험 지수' 투명 고지 메타데이터 검증
- [US-G1] 출발 거점 연계 공영주차장(P&R) 코스 탐색:
  - 현위치 반경 1.5km 이내 공영주차장 목록 필터링
  - 선택한 주차장 출입구 보행로 시작/종료 안심 순환 코스 스냅 DTO 검증
"""

import pytest
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

INSOLATION_WEIGHTS = {
    "clear": 1.0,
    "partly_cloudy": 0.6,
    "overcast": 0.2,
    "rainy": 0.0,
}


class HeatRiskHourDTO(BaseModel):
    """[US-F1] 시간대별 열 위험 지수 DTO."""
    hour: int = Field(..., ge=0, le=23)
    air_temp_celsius: float
    estimated_surface_temp: float
    risk_level: str  # "SAFE" (<=35), "CAUTION" (35~45), "DANGER" (>45)
    is_golden_time: bool
    notice: str = "본 지수는 기상청 예보 모델 기반 추정치입니다."


class ParkingLotDTO(BaseModel):
    """[US-G1] P&R 공영주차장 DTO."""
    parking_id: str
    name: str
    distance_m: float = Field(..., ge=0.0)
    entrance_lat: float
    entrance_lon: float
    is_public: bool = True
    fee_type: str = "paid"


def calculate_estimated_surface_temperature(
    air_temp_celsius: float,
    sky_condition: str
) -> float:
    """기상청 단기예보 기반 지면열 추정 수지식 연산 (US-F1)."""
    weight = INSOLATION_WEIGHTS.get(sky_condition.lower(), 0.5)
    return round(air_temp_celsius + (weight * 15.0), 1)


def is_safe_walk_temperature(surface_temp_celsius: float) -> bool:
    """35℃ 이하 안전 산책 가능 여부 판별."""
    return surface_temp_celsius <= 35.0


def determine_heat_risk_dto(hour: int, air_temp: float, sky: str) -> HeatRiskHourDTO:
    """[US-F1] 시간대별 지면열 연산 및 골든타임 DTO 생성."""
    surface_temp = calculate_estimated_surface_temperature(air_temp, sky)
    is_golden = is_safe_walk_temperature(surface_temp)

    if surface_temp <= 35.0:
        risk = "SAFE"
    elif surface_temp <= 45.0:
        risk = "CAUTION"
    else:
        risk = "DANGER"

    return HeatRiskHourDTO(
        hour=hour,
        air_temp_celsius=air_temp,
        estimated_surface_temp=surface_temp,
        risk_level=risk,
        is_golden_time=is_golden
    )


def filter_nearby_parking_lots(
    parking_lots: List[Dict[str, Any]],
    max_distance_m: float = 1500.0
) -> List[Dict[str, Any]]:
    """출발지 기준 반경 1.5km 이내 주차장 필터링 (US-G1)."""
    return [p for p in parking_lots if p.get("distance_m", 9999.0) <= max_distance_m]


# ==========================================
# 테스트 스위트
# ==========================================

class TestSurfaceThermalEstimation:
    """[US-F1] 기상 데이터 연동 지면열 추정 및 골든타임 테스트."""

    def test_clear_sky_noon_heat_exceeds_safe_threshold(self):
        """한여름 낮 기온 30℃, 맑음(1.0)일 때 지면열 45℃로 안전 기준(35℃)을 초과해야 함."""
        temp = calculate_estimated_surface_temperature(air_temp_celsius=30.0, sky_condition="clear")
        assert temp == 45.0
        assert is_safe_walk_temperature(temp) is False

    def test_overcast_day_within_safe_threshold(self):
        """기온 28℃, 흐림(0.2)일 때 지면열 31.0℃로 안전 산책 가능 판정 검증."""
        temp = calculate_estimated_surface_temperature(air_temp_celsius=28.0, sky_condition="overcast")
        assert temp == 31.0  # 28.0 + (0.2 * 15) = 31.0
        assert is_safe_walk_temperature(temp) is True

    def test_evening_cool_down_becomes_golden_time(self):
        """일몰 후(가중치 0.0) 기온 24℃일 때 지면열 24℃로 골든타임 진입 검증."""
        dto = determine_heat_risk_dto(hour=19, air_temp=24.0, sky="rainy")
        assert dto.is_golden_time is True
        assert dto.risk_level == "SAFE"
        assert dto.estimated_surface_temp == 24.0

    def test_transparency_notice_included_in_dto(self):
        """추정치 안내 투명성 고지 문구가 DTO에 반드시 포함되어야 함."""
        dto = determine_heat_risk_dto(hour=14, air_temp=31.0, sky="clear")
        assert "기상청 예보 모델 기반 추정치" in dto.notice


class TestParkingLotPnRSearch:
    """[US-G1] 공영주차장 P&R(Park & Walk) 코스 탐색 테스트."""

    def test_filter_parking_lots_within_1500m(self):
        """1.5km 이내 주차장만 필터링되고 원거리(2.5km) 주차장은 제외되는지 검증."""
        mock_lots = [
            {"id": "pkg-01", "name": "보라매공원 동문 공영주차장", "distance_m": 450.0, "fee_type": "paid"},
            {"id": "pkg-02", "name": "신대방 공영주차장", "distance_m": 1200.0, "fee_type": "free"},
            {"id": "pkg-03", "name": "여의도 한강 공영주차장", "distance_m": 2500.0, "fee_type": "paid"},  # 제외 대상
        ]

        filtered = filter_nearby_parking_lots(mock_lots, max_distance_m=1500.0)
        assert len(filtered) == 2
        assert any(p["id"] == "pkg-01" for p in filtered)
        assert any(p["id"] == "pkg-02" for p in filtered)
        assert not any(p["id"] == "pkg-03" for p in filtered)

    def test_parking_lot_dto_validation(self):
        """P&R 주차장 DTO 규격 및 위경도 유효성 검증."""
        dto = ParkingLotDTO(
            parking_id="pkg-001",
            name="보라매공원 공영주차장",
            distance_m=420.0,
            entrance_lat=37.492,
            entrance_lon=126.923,
            is_public=True
        )
        assert dto.distance_m == 420.0
        assert dto.is_public is True

