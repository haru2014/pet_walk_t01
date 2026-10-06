"""편하개 TDD 공통 Fixture 및 Mock 데이터 정의 모듈.

애자일 사용자 스토리(US-A1 ~ US-H1) 및 시스템 아키텍처에 정의된
핵심 데이터 모델과 테스트 환경을 구성합니다.
"""

import pytest
from typing import Dict, Any, List


@pytest.fixture
def sample_dog_profiles() -> Dict[str, Dict[str, Any]]:
    """5인 CBT 시나리오 테스터용 반려견 프로필 Fixture (Local-First AsyncStorage 호환)."""
    return {
        "tester1_maltese": {
            "dog_id": "dog-maltese-001",
            "name": "코코",
            "breed": "말티즈",
            "age": 4,
            "weight_kg": 3.2,
            "joint_care_level": 2,  # 관절 안심 케어 집중 (안심 보행 2단계)
            "default_preferred_surfaces": ["dirt", "grass"],
            "speed_kmh": 2.8,  # 소형견 표준 속도
            "notes": "폭신한 흙길과 잔디밭을 선호하며 계단을 회피함",
        },
        "tester2_retriever": {
            "dog_id": "dog-retriever-002",
            "name": "보리",
            "breed": "골든 리트리버",
            "age": 3,
            "weight_kg": 29.5,
            "joint_care_level": 0,  # 일반 활력 보행
            "default_preferred_surfaces": ["grass", "rubber", "paved"],
            "speed_kmh": 4.2,  # 대형견 표준 속도
            "notes": "탄성포장 및 넓은 보행로 선호",
        },
        "tester3_senior_poodle": {
            "dog_id": "dog-poodle-003",
            "name": "초코",
            "breed": "토이 푸들",
            "age": 11,
            "weight_kg": 4.1,
            "joint_care_level": 3,  # 노령견 관절 집중 안심 케어
            "default_preferred_surfaces": ["rubber", "dirt"],
            "speed_kmh": 2.2,  # 노령견/관절안심 표준 속도
            "notes": "경사도 5% 이하의 매우 완만한 평지만 권장",
        },
        "tester4_welsh_corgi": {
            "dog_id": "dog-corgi-004",
            "name": "뭉치",
            "breed": "웰시코기",
            "age": 5,
            "weight_kg": 12.0,
            "joint_care_level": 1,  # 허리/관절 주의
            "default_preferred_surfaces": ["dirt", "grass"],
            "speed_kmh": 3.6,  # 중형견 표준 속도
            "notes": "높은 턱과 계단 배제 필수",
        },
    }


@pytest.fixture
def mock_osm_network_links() -> List[Dict[str, Any]]:
    """가상의 OSM 보행 네트워크 링크 세트 Fixture (계단, 경사도, 그늘, 출처 메타데이터 포함)."""
    return [
        {"id": "link-01", "length_m": 120.0, "surface": "grass", "highway": "footway", "in_park": True, "slope_percent": 2.1, "shade_ratio": 0.8, "surface_source": "osm_verified"},
        {"id": "link-02", "length_m": 150.0, "surface": "dirt", "highway": "path", "in_park": True, "slope_percent": 3.5, "shade_ratio": 0.7, "surface_source": "seed_verified"},
        {"id": "link-03", "length_m": 80.0, "surface": "rubber", "highway": "footway", "in_park": False, "slope_percent": 1.2, "shade_ratio": 0.5, "surface_source": "community_verified"},
        {"id": "link-04", "length_m": 200.0, "surface": "paved", "highway": "pedestrian", "in_park": False, "slope_percent": 4.0, "shade_ratio": 0.6, "surface_source": "estimated"},
        {"id": "link-05", "length_m": 300.0, "surface": "asphalt", "highway": "residential", "in_park": False, "slope_percent": 5.8, "shade_ratio": 0.2, "surface_source": "estimated"},
        {"id": "link-06", "length_m": 50.0, "surface": "gravel", "highway": "track", "in_park": False, "slope_percent": 9.5, "shade_ratio": 0.3, "surface_source": "estimated"},
        # 야외 계단 링크 (US-B1 계단 회피 테스트용)
        {"id": "link-steps-01", "length_m": 35.0, "surface": "paved", "highway": "steps", "in_park": True, "slope_percent": 22.0, "shade_ratio": 0.4, "surface_source": "osm"},
        # 급경사 링크 (US-B2 DEM 경사도 제어 테스트용)
        {"id": "link-steep-01", "length_m": 90.0, "surface": "paved", "highway": "footway", "in_park": False, "slope_percent": 11.2, "shade_ratio": 0.1, "surface_source": "estimated"},
        # 태그 누락 (결측치) 링크
        {"id": "link-missing-footway", "length_m": 100.0, "surface": None, "highway": "footway", "in_park": False, "slope_percent": 2.0, "shade_ratio": 0.3, "surface_source": None},
        {"id": "link-missing-park", "length_m": 150.0, "surface": None, "highway": "footway", "in_park": True, "slope_percent": 3.0, "shade_ratio": 0.85, "surface_source": None},
        {"id": "link-missing-road", "length_m": 250.0, "surface": None, "highway": "residential", "in_park": False, "slope_percent": 4.5, "shade_ratio": 0.2, "surface_source": None},
    ]


@pytest.fixture
def sample_geojson_route() -> Dict[str, Any]:
    """경로 렌더링 및 통계 계산을 위한 표준 GeoJSON FeatureCollection Fixture."""
    return {
        "type": "FeatureCollection",
        "properties": {
            "route_id": "route_test_001",
            "total_distance_m": 1200.0,
            "estimated_duration_minutes": 25,
            "preferred_surfaces": ["dirt", "grass"],
            "max_slope_percent": 3.5,
            "average_slope_percent": 2.2,
            "has_stairs": False,
            "average_shade_ratio": 0.72,
            "surface_breakdown": {
                "grass": 450.0,   # 37.5%
                "dirt": 350.0,    # 29.2% -> 선호 노면 합계 66.7%
                "paved": 250.0,   # 20.8%
                "asphalt": 150.0  # 12.5%
            },
            "navigation_steps": [
                {"distance_m": 120, "instruction": "직진 후 50m 앞 우회전하세요", "voice_brief": "50m 앞 부드러운 완만길입니다. 우회전하세요"},
                {"distance_m": 350, "instruction": "그늘 산책로 진입", "voice_brief": "지금부터 300m 동안 시원한 그늘길이 이어집니다"},
                {"distance_m": 450, "instruction": "출발 지점으로 복귀", "voice_brief": "곧 산책이 종료됩니다. 수고하셨습니다"}
            ]
        },
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [127.0276, 37.4979],
                        [127.0285, 37.4985],
                    ]
                },
                "properties": {
                    "surface_type": "grass",
                    "length_m": 450.0,
                    "slope_percent": 2.1,
                    "shade_ratio": 0.8,
                    "has_stairs": False,
                    "color": "#10B981",  # 초록
                    "safety_score": 95
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [127.0285, 37.4985],
                        [127.0298, 37.4992],
                    ]
                },
                "properties": {
                    "surface_type": "dirt",
                    "length_m": 350.0,
                    "slope_percent": 3.5,
                    "shade_ratio": 0.7,
                    "has_stairs": False,
                    "color": "#10B981",  # 초록
                    "safety_score": 90
                }
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [127.0298, 37.4992],
                        [127.0276, 37.4979],
                    ]
                },
                "properties": {
                    "surface_type": "paved",
                    "length_m": 400.0,
                    "slope_percent": 1.8,
                    "shade_ratio": 0.65,
                    "has_stairs": False,
                    "color": "#3B82F6",  # 파랑
                    "safety_score": 80
                }
            }
        ]
    }

