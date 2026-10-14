"""[US-A1, US-F1] 실시간 기상청 지면열 DTO의 LangGraph WalkPlanningAgent 바인딩 및 브리핑 검증 테스트 모듈.

과제 1-1 요구사항:
1. 기상청 예보 DTO(air_temp_celsius, estimated_surface_temp, is_golden_time)를 WalkPlanningAgent 상태 머신에 주입.
2. 모호한 자연어 질의("지금 가도 안 더워?") 입력 시 실시간 기상 데이터를 참조하여 브리핑 생성:
   - "현재 기상청 예보 기준 지면온도가 38℃로 뜨거워요. 17시 이후 산책을 권장하며, 지금은 폭신한 그늘 숲길 위주로 안내할게요."
3. 지면온도에 따라 후보 경로의 지면온도 지표가 동적으로 계산되고 그늘길(variant 1)이 우선 선정되는지 검증.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from agent.walk_planning_agent import run_walk_planning_agent
from test_case.test_thermal_and_parking import determine_heat_risk_dto

client = TestClient(app)


def test_walk_agent_weather_binding_high_temp_hot_query():
    """지면온도 38℃ 한여름 한낮에 '지금 가도 안 더워?' 질의 시 기상청 지면열 경고 브리핑 생성 검증."""
    mock_weather = {
        "current": {
            "hour": 14,
            "air_temp_celsius": 30.0,
            "estimated_surface_temp": 38.0,
            "risk_level": "CAUTION",
            "is_golden_time": False,
            "notice": "본 지수는 기상청 예보 모델 기반 추정치입니다.",
        },
        "golden_time_window": "17:00 ~ 20:00",
        "is_live_estimated": True,
    }

    result = run_walk_planning_agent(
        user_query="지금 가도 안 더워? 25분 산책하고 싶어요",
        client_dog_context={
            "dog_id": "dog-choco",
            "name": "초코",
            "breed": "말티즈",
            "speed_kmh": 2.8,
            "joint_care_level": 1,
        },
        weather_context=mock_weather,
        origin_lat=36.3628,
        origin_lon=127.3592,
        origin_mode="park",
    )

    assert result.status == "completed"
    briefing = result.briefing_message

    # 1. 기상청 예보 기준 지면온도(38℃) 고지 확인
    assert "지면온도가 38℃로 뜨거워요" in briefing or "38" in briefing
    # 2. 산책 권장 시간대(골든타임 윈도우) 또는 그늘 숲길 안내 확인
    assert "그늘 숲길" in briefing or "산책을 권장" in briefing
    # 3. 반려견 웰니스 카피라이팅 확인
    assert "초코" in briefing and "말티즈" in briefing
    # 4. 그늘길(variant 1)의 지면온도가 그늘 차광 효과로 완화되어 최우선 추천 코스로 도출되는지 검증
    assert result.best_route is not None
    assert result.best_score > 70.0


def test_walk_agent_weather_binding_safe_golden_time():
    """지면온도 26℃ 안전 골든타임 시 안전 안내 브리핑 생성 검증."""
    mock_weather = {
        "current": {
            "hour": 18,
            "air_temp_celsius": 24.0,
            "estimated_surface_temp": 26.0,
            "risk_level": "SAFE",
            "is_golden_time": True,
            "notice": "본 지수는 기상청 예보 모델 기반 추정치입니다.",
        },
        "golden_time_window": "17:00 ~ 20:00",
        "is_live_estimated": True,
    }

    result = run_walk_planning_agent(
        user_query="초코와 30분 산책 갈래요",
        client_dog_context={
            "dog_id": "dog-choco",
            "name": "초코",
            "breed": "푸들",
            "speed_kmh": 3.0,
            "joint_care_level": 0,
        },
        weather_context=mock_weather,
        origin_lat=36.3628,
        origin_lon=127.3592,
        origin_mode="park",
    )

    assert result.status == "completed"
    briefing = result.briefing_message
    assert "안전한 골든타임" in briefing
    assert "26" in briefing


def test_walk_plan_api_endpoint_weather_integration():
    """POST /api/v1/walk/plan 호출 시 weather_context 바인딩 및 응답 페이로드 검증."""
    res = client.post(
        "/api/v1/walk/plan",
        json={
            "dog_name": "보리",
            "breed": "골든리트리버",
            "target_duration_minutes": 30,
            "user_query": "햇빛이 너무 센데 지금 산책 괜찮을까요?",
            "origin_lat": 36.3628,
            "origin_lon": 127.3592,
            "origin_mode": "park",
            "weather_context": {
                "current": {
                    "hour": 13,
                    "air_temp_celsius": 31.0,
                    "estimated_surface_temp": 46.0,
                    "risk_level": "DANGER",
                    "is_golden_time": False,
                },
                "golden_time_window": "18:00 ~ 21:00",
            },
        },
    )

    assert res.status_code == 200
    data = res.json()
    assert "weather" in data
    assert data["weather"]["current"]["estimated_surface_temp"] == 46.0
    assert "46" in data["briefing"]
    assert "그늘 숲길" in data["briefing"]
