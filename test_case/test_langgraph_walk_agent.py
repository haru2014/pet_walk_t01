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
        assert result.best_score >= 90.0
        assert len(result.all_scored_candidates) == 3
        assert result.all_scored_candidates[0].candidate.route_id == best.route_id

        # 4. 웰니스 브리핑 검증 (질병 용어 배제 & 반려견 이름/견종 포함)
        briefing = result.briefing_message
        assert "코코" in briefing
        assert "말티즈" in briefing
        assert "폭신한 길" in briefing or "완만한" in briefing
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
        assert result.best_score >= 80.0


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
