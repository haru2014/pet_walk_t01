r"""[US-A1, US-A3, US-B1~B3, US-E3] LangGraph ReAct Walk Planning Agent TDD 검증 스위트.

1번(팀장 / 조현정 / PM & AI Agent Lead) R&R 핵심 테스트:
1. LangGraph StateGraph 워크플로우 빌드 및 컴파일 무결성 검증
2. 자연어 발화 의도 파싱(WalkIntent Pydantic V2 Strict Schema) 및 엔티티 추출 정확도
3. 체급별 표준 보행 속도 모델($D = V \times T$) 및 목표 시간 오차 $\pm 15\%$ 수렴
4. 무장애길(계단 배제, 완만 경사) & 지면온도 회피 다요소 스코어러(Candidate Route Scorer 100점 만점) 연동
5. 클라이언트 누적 피드백(경사 불만족 등) 기반 무상태(Stateless) 프롬프트 가중치 보정
6. 웰니스 카피라이팅 가드레일 (임상 질병 단어 검출 0건)
"""

import pytest
from typing import Dict, Any, List

from agent.walk_planning_agent import (
    create_walk_planning_agent,
    run_walk_planning_agent,
    WalkPlanningResult,
    WalkIntent,
    ClientDogContext,
    FeedbackSummaryItem,
    get_standard_speed_kmh,
    parse_natural_language_walk_query,
    build_fallback_walk_intent,
    calibrate_max_slope_with_feedback,
    score_candidate_route,
    RouteCandidate
)


class TestLangGraphAgentWorkflowCompilation:
    """LangGraph StateGraph 컴파일 및 그래프 구조 검증."""

    def test_state_graph_compilation_success(self):
        """LangGraph StateGraph가 모든 필수 노드를 포함하여 에러 없이 컴파일되는지 검증."""
        agent = create_walk_planning_agent()
        assert agent is not None

        # 컴파일된 워크플로우 노드 확인
        graph_nodes = agent.get_graph().nodes
        expected_nodes = [
            "parse_intent",
            "calibrate_constraints",
            "generate_candidates",
            "score_and_rank",
            "synthesize_briefing"
        ]
        for node in expected_nodes:
            assert node in graph_nodes, f"노드 '{node}'가 LangGraph 워크플로우에 등록되어 있어야 합니다."


class TestLangGraphAgentExecutionSeniorMaltese:
    """노령견/소형견 시나리오: '9살 노령 말티즈라 계단 피하고 완만한 길로 20분만'."""

    def test_senior_maltese_full_agent_cycle(self):
        """자연어 의도 파싱부터 라우팅 후보 생성, 100점 채점, 브리핑 합성까지의 ReAct 전주기 검증."""
        user_query = "9살 노령 말티즈라 계단 피하고 완만한 길로 20분만 가볍게 산책하고 싶어"
        dog_context = {
            "dog_id": "dog-coco-001",
            "name": "코코",
            "breed": "말티즈",
            "age_years": 9,
            "weight_kg": 3.2,
            "joint_care_level": 2,
            "default_preferred_surfaces": ["dirt", "grass"]
        }

        result: WalkPlanningResult = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=dog_context,
            origin_lat=37.5665,
            origin_lon=126.9780
        )

        assert result.status == "completed"

        # 1. 의도 파싱 검증 (US-A1)
        assert result.intent.target_duration_minutes == 20
        assert result.intent.avoid_stairs is True
        assert result.intent.slope_preference == "gentle"

        # 2. 노령견 속도 모델링 검증 (US-A3: 2.2 km/h)
        # 20분 -> 목표 거리 약 733m (오차 ±15% 이내)
        best = result.best_route
        assert 600.0 <= best.total_distance_m <= 900.0
        assert best.has_stairs is False
        assert best.max_slope_percent <= 5.0

        # 3. Candidate Route Scorer 검증 (US-B3: 100점 만점 중 90점 이상)
        # [제안 맞춤 점수] 자료가 없는 서울 좌표라 계단·그늘·노면은 중간 점수: 고정 프로필 시절 90 → 80
        assert result.best_score >= 80.0
        assert len(result.all_scored_candidates) == 3
        assert result.all_scored_candidates[0].candidate.route_id == best.route_id

        # 4. 웰니스 브리핑 검증 (질병 용어 배제 & 반려견 이름/견종 포함)
        briefing = result.briefing_message
        assert "코코" in briefing
        assert "말티즈" in briefing
        # 자료가 없는 서울 좌표: 확인하지 않은 계단·경사·노면을 말하지 않는다 (#114)
        assert "준비했어요" in briefing
        for unmeasured in ["폭신한", "완만한", "계단 걱정"]:
            assert unmeasured not in briefing
        for forbidden in ["슬개골", "탈구", "관절염", "디스크", "질환", "환견"]:
            assert forbidden not in briefing

        # 5. 실행 추적 로그 검증
        assert len(result.execution_trace) >= 5
        assert any("[Node: parse_intent]" in t for t in result.execution_trace)
        assert any("[Node: score_and_rank]" in t for t in result.execution_trace)


class TestLangGraphAgentLargeDogEnergetic:
    """대형견 시나리오: 골든 리트리버 활력 보행."""

    def test_large_retriever_speed_and_distance_scaling(self):
        """대형견(29.5kg) 보행 시 4.2 km/h 속도 모델이 적용되어 장거리 코스가 정상 연산되는지 검증."""
        user_query = "날씨가 선선하니 40분 정도 흙길 위주로 신나게 걷고 싶어"
        dog_context = {
            "dog_id": "dog-bori-002",
            "name": "보리",
            "breed": "골든 리트리버",
            "age_years": 3,
            "weight_kg": 29.5,
            "joint_care_level": 0,
            "default_preferred_surfaces": ["dirt", "grass", "rubber"]
        }

        result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=dog_context
        )

        assert result.status == "completed"
        assert result.intent.target_duration_minutes == 40
        # 4.2 km/h * (40/60) = 약 2,800m
        assert result.best_route.total_distance_m >= 2200.0
        assert "보리" in result.briefing_message


class TestLangGraphAgentFeedbackAdaptation:
    """[US-E3] 최근 피드백(경사 불만족 등) 기반 무상태 AI 제약조건 동적 보정 검증."""

    def test_agent_calibrates_slope_with_negative_feedback(self):
        """'too_steep' 피드백 2건 전달 시 허용 경사도가 2%p 하향 보정되어 에이전트 실행에 반영되는지 검증."""
        user_query = "가볍게 25분 산책"
        dog_context = {
            "dog_id": "dog-choco-003",
            "name": "초코",
            "breed": "푸들",
            "age_years": 5,
            "weight_kg": 5.0,
            "joint_care_level": 1
        }
        recent_feedback = [
            {"tag": "too_steep", "count": 2}
        ]

        result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=dog_context,
            client_recent_feedback=recent_feedback
        )

        assert result.status == "completed"
        # 피드백 반영 트레이스 확인
        calib_trace = [t for t in result.execution_trace if "[Node: calibrate_constraints]" in t]
        assert len(calib_trace) > 0
        # 피드백에 의해 경사 기준이 하향 보정되었는지 확인 (기본 7.0% -> 5.0%)
        assert "MaxSlope: 5.0%" in calib_trace[0]

    def test_agent_adapts_multi_factor_feedback_shade_and_surfaces(self):
        """'lack_of_shade' 및 'rough_surface' 피드백 수신 시 그늘 우선(True) 및 부드러운 노면 보강 검증."""
        user_query = "동네 한바퀴 20분"
        dog_context = {"dog_id": "dog-01", "name": "보리", "breed": "시츄", "age_years": 4, "weight_kg": 5.5}
        recent_feedback = [
            {"tag": "lack_of_shade", "count": 1},
            {"tag": "rough_surface", "count": 1},
        ]
        result = run_walk_planning_agent(
            user_query=user_query,
            client_dog_context=dog_context,
            client_recent_feedback=recent_feedback,
        )
        assert result.status == "completed"
        assert result.intent.shade_priority is True
        assert "dirt" in result.intent.preferred_surfaces
        assert "grass" in result.intent.preferred_surfaces


class TestLangGraphAgentFallbackHandling:
    """[US-A1] 모호하거나 빈 질의 시 안전 프리셋 Fallback 검증."""

    def test_ambiguous_empty_query_fallback(self):
        """내용이 없는 질의 전달 시 20분, 완만 경사, 계단 회피의 안전 프리셋으로 자동 폴백되는지 검증."""
        result = run_walk_planning_agent(user_query="")
        assert result.status == "completed"
        assert result.intent.target_duration_minutes == 20
        assert result.intent.avoid_stairs is True
        assert result.intent.slope_preference == "gentle"
        assert result.best_route is not None
        # [제안 맞춤 점수] 자료가 없는 서울 좌표라 중간 점수: 80 → 70
        assert result.best_score >= 70.0


class TestCandidateRouteScorerMultiFactorBreakdown:
    """[US-B3] Candidate Route Scorer 다요소 세부 점수(100점 만점) 정합성 검증."""

    def test_candidate_scorer_breakdown(self):
        """계단 배제(30), 경사도(30), 지면온도(20), 거리(20) 4개 평가 지표의 총합 및 순위 검증."""
        c = RouteCandidate(
            route_id="test-route-1",
            name="테스트 완만길",
            total_distance_m=1000.0,
            estimated_duration_minutes=20.0,
            has_stairs=False,
            max_slope_percent=4.0,  # <= 5.0% -> 30점
            surface_temp_c=29.0     # <= 32.0℃ -> 20점
        )
        scored = score_candidate_route(c, target_distance_m=1000.0)
        assert scored.stairs_score == 30.0
        assert scored.slope_score == 30.0
        assert scored.thermal_score == 20.0
        assert scored.distance_score == 20.0
        assert scored.total_score == 100.0


class TestNaturalLanguageWalkIntentParser:
    """[US-A1] 자연어 파서 상세 케이스 검증 (다양한 한국어 시간 표현, 노면, 계단, 모호 질의)."""

    def test_korean_hour_expressions(self):
        """'1시간', '한시간 반', '반시간' 등 자연스러운 한국어 시간 표현 엔티티 추출 검증."""
        intent_1h = parse_natural_language_walk_query("오늘 날씨 좋아서 1시간 동안 산책할래")
        assert intent_1h.target_duration_minutes == 60

        intent_half_h = parse_natural_language_walk_query("가볍게 반시간만 돌고 오자")
        assert intent_half_h.target_duration_minutes == 30

        intent_90m = parse_natural_language_walk_query("오늘은 여유 있어서 한시간 반 코스로 가자")
        assert intent_90m.target_duration_minutes == 90

    def test_surface_and_stairs_extraction(self):
        """'폭신한 흙길', '계단 절대 피해' 등 표면/제약조건 추출 검증."""
        intent = parse_natural_language_walk_query("계단 없는 폭신한 흙길과 잔디로 30분 코스 찾아줘")
        assert intent.avoid_stairs is True
        assert intent.target_duration_minutes == 30
        assert "dirt" in intent.preferred_surfaces or "grass" in intent.preferred_surfaces

    def test_meaningless_query_fallback(self):
        """산책 의도 키워드가 전무한 불명확 질의 입력 시 안전 기본 프리셋 반환 검증."""
        intent_greeting = parse_natural_language_walk_query("안녕하세요")
        assert intent_greeting.target_duration_minutes == 20
        assert intent_greeting.avoid_stairs is True
        assert intent_greeting.extraction_confidence == 0.60


class TestDogSpeedModelAndDistanceFormula:
    """[US-A3] 체급별(소형/중형/대형/노령견) 표준 보행 속도 상수 및 거리 환산 검증."""

    def test_speed_constants_by_dog_type(self):
        """체중, 연령, 관절케어 수준에 따른 정확한 속도 상수 반환 검증."""
        # 1. 소형견 (체중 < 10kg, 성견, 케어 0~1) -> 2.8 km/h
        assert get_standard_speed_kmh(weight_kg=4.5, age_years=3, joint_care_level=1) == 2.8

        # 2. 중형견 (10kg <= 체중 < 25kg, 성견, 케어 0~1) -> 3.6 km/h
        assert get_standard_speed_kmh(weight_kg=14.0, age_years=4, joint_care_level=0) == 3.6

        # 3. 대형견 (체중 >= 25kg, 성견, 케어 0~1) -> 4.2 km/h
        assert get_standard_speed_kmh(weight_kg=32.0, age_years=3, joint_care_level=0) == 4.2

        # 4. 노령견 (age >= 8) -> 2.2 km/h
        assert get_standard_speed_kmh(weight_kg=4.5, age_years=9, joint_care_level=0) == 2.2

        # 5. 관절 안심 케어 수준 2 이상 -> 2.2 km/h
        assert get_standard_speed_kmh(weight_kg=15.0, age_years=3, joint_care_level=2) == 2.2

    def test_distance_formula_conversion(self):
        """D = V * T 환산 공식 검증 (예: 3.6 km/h로 30분 산책 시 1,800m)."""
        speed_kmh = 3.6
        duration_min = 30
        target_dist_m = round((speed_kmh * 1000.0 / 60.0) * duration_min, 1)
        assert target_dist_m == 1800.0


class TestPydanticV2StrictSchemaValidation:
    """Pydantic V2 Strict Schema 검증 오류 핸들링."""

    def test_walk_intent_out_of_bounds_validation(self):
        """산책 목표 시간이 허용 범위(10~120분)를 벗어나면 ValidationError 발생 검증."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            WalkIntent(target_duration_minutes=5)  # 최소 10분 미만

        with pytest.raises(ValidationError):
            WalkIntent(target_duration_minutes=121)  # 최대 120분 초과 (한도는 agent/walk_limits.py, 이슈 #125)

    def test_client_dog_context_validation(self):
        """반려견 프로필 필수 필드 및 제약조건 검증."""
        from pydantic import ValidationError

        with pytest.raises(ValidationError):
            ClientDogContext(weight_kg=-2.0)  # 음수 체중 불가

        with pytest.raises(ValidationError):
            ClientDogContext(age_years=-1)  # 음수 연령 불가


class TestFastApiAgentIntegration:
    """FastAPI 엔드포인트와 LangGraph Walk Planning Agent 결합 검증."""

    def test_plan_endpoint_with_custom_user_query(self):
        """POST /api/v1/walk/plan 엔드포인트에 자연어 질의와 체급 프로필 전달 시 정상 처리 검증."""
        from fastapi.testclient import TestClient
        from main import app

        client = TestClient(app)
        payload = {
            "dog_name": "맥스",
            "breed": "골든 리트리버",
            "weight_kg": 32.0,
            "age_years": 3,
            "user_query": "맥스와 45분 동안 계단 없는 완만한 그늘길 걷고 싶어요",
            "origin_lat": 37.5665,
            "origin_lon": 126.9780
        }

        resp = client.post("/api/v1/walk/plan", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        assert "courses" in data
        assert len(data["courses"]) >= 1
        best_course = data["courses"][0]
        # 현재 위치(공원 밖) 경로는 계단 자료(OSM 태그)가 없어 실측 카드는 '정보 없음'이다 (#114). 예전 '0회'는 확인 없는 고정값.
        assert best_course["stairsCount"] == "정보 없음"
        assert "맥스" in data["summary"] or "골든 리트리버" in data["summary"]


class TestDataSourceReliabilityAndSlopeStandard:
    """[P1 과제] 실측/추정/결측 구분 및 8%/15% 경사도 채점 기준 정합성 검증."""

    def test_slope_scorer_8_percent_and_15_percent_thresholds(self):
        """최대 경사 8% 이하 만점(30점), 15% 초과 탈락(0점), 8~15% 선형 감점 검증."""
        # 1. 8% 이하: 만점 30점
        c_gentle = RouteCandidate(
            route_id="r1", name="완만", total_distance_m=1000.0,
            estimated_duration_minutes=20.0, has_stairs=False,
            max_slope_percent=8.0, surface_temp_c=28.0,
        )
        scored_gentle = score_candidate_route(c_gentle, target_distance_m=1000.0)
        assert scored_gentle.slope_score == 30.0

        # 2. 11.5% (중간): 15.0점
        c_mid = RouteCandidate(
            route_id="r2", name="중간", total_distance_m=1000.0,
            estimated_duration_minutes=20.0, has_stairs=False,
            max_slope_percent=11.5, surface_temp_c=28.0,
        )
        scored_mid = score_candidate_route(c_mid, target_distance_m=1000.0)
        assert scored_mid.slope_score == 15.0

        # 3. 15.1% (초과): 탈락 0.0점
        c_steep = RouteCandidate(
            route_id="r3", name="급경사", total_distance_m=1000.0,
            estimated_duration_minutes=20.0, has_stairs=False,
            max_slope_percent=15.1, surface_temp_c=28.0,
        )
        scored_steep = score_candidate_route(c_steep, target_distance_m=1000.0)
        assert scored_steep.slope_score == 0.0

    def test_candidate_data_reliability_fields(self):
        """후보 경로 모델의 실측/추정/결측 출처 필드 존재 및 기본값 검증."""
        c = RouteCandidate(
            route_id="r_src", name="출처 테스트", total_distance_m=1000.0,
            estimated_duration_minutes=20.0,
        )
        assert hasattr(c, "slope_source")
        assert hasattr(c, "stairs_source")
        assert hasattr(c, "shade_source")
        assert hasattr(c, "data_reliability")
        assert c.data_reliability in ("measured", "estimated", "fallback")


