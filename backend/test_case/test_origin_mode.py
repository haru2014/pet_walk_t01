"""[US-A1, US-A3] 산책 경로 생성 진입 경로 2가지 (현재 위치 기반 vs 지정 공원 주변) 검증 테스트.

1. 현재 위치 기반 (`current_location`):
   - 단말기 현위치 좌표를 출발점으로 실시간 도로망 순환 코스 생성
   - 공원 고정 트랙에 종속되지 않고 현위치 주변 순환

2. 지정한 공원 주변 (`park`):
   - 대전/세종 거점 공원(유림공원, 세종호수공원 등) 실제 OSM 정밀 보행로 추종
   - 공원 내 보행률 90% 이상 코스 생성
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from agent.walk_planning_agent import run_walk_planning_agent

client = TestClient(app)


def test_origin_mode_current_location_via_agent():
    """진입 경로 1: 현재 위치 기반(current_location) 에이전트 실행 검증."""
    result = run_walk_planning_agent(
        user_query="초코와 25분 산책하고 싶어요",
        client_dog_context={
            "dog_id": "dog-choco",
            "name": "초코",
            "breed": "말티즈",
            "speed_kmh": 2.8,
            "joint_care_level": 1,
        },
        origin_lat=36.3628,
        origin_lon=127.3592,
        origin_mode="current_location",
    )
    assert result.status == "completed"
    assert result.best_route is not None
    assert len(result.best_route.geojson_coordinates) > 0
    assert result.best_route.total_distance_m > 0


def test_origin_mode_park_via_agent():
    """진입 경로 2: 지정 공원 둘레길(park) 에이전트 실행 검증."""
    # 대전 유림공원 중심 좌표 (36.3628, 127.3592)
    result = run_walk_planning_agent(
        user_query="초코와 30분 공원 둘레길 산책하고 싶어요",
        client_dog_context={
            "dog_id": "dog-choco",
            "name": "초코",
            "breed": "말티즈",
            "speed_kmh": 2.8,
            "joint_care_level": 1,
        },
        origin_lat=36.3628,
        origin_lon=127.3592,
        origin_mode="park",
    )
    assert result.status == "completed"
    assert result.best_route is not None
    # 유림공원 OSM 코스는 최소 30개 이상의 좌표열 보유
    assert len(result.best_route.geojson_coordinates) >= 30


def test_origin_mode_api_endpoint():
    """POST /api/v1/walk/plan 엔드포인트에서 2가지 origin_mode 파라미터 수신 검증."""
    # 1. current_location
    res1 = client.post(
        "/api/v1/walk/plan",
        json={
            "dog_name": "초코",
            "target_duration_minutes": 25,
            "origin_lat": 36.3628,
            "origin_lon": 127.3592,
            "origin_mode": "current_location",
            "park_zone": "현재 위치 주변",
        },
    )
    assert res1.status_code == 200
    data1 = res1.json()
    assert len(data1["courses"]) > 0
    assert data1["geojson"]["type"] == "FeatureCollection"

    # 2. park
    res2 = client.post(
        "/api/v1/walk/plan",
        json={
            "dog_name": "초코",
            "target_duration_minutes": 30,
            "origin_lat": 36.3628,
            "origin_lon": 127.3592,
            "origin_mode": "park",
            "park_zone": "유림공원",
        },
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert len(data2["courses"]) > 0
    assert data2["geojson"]["type"] == "FeatureCollection"
