"""[US-B3 제안] 맞춤 점수(agent/personalized_scorer.py): 실측 지표 + 관절 단계 + 그늘·노면 선호."""

import pytest
from fastapi.testclient import TestClient

import main
from agent.personalized_scorer import (
    JOINT_SLOPE_LIMIT, cooled_surface_temp, preference_weights, score_personalized, slope_limit_for,
)
from agent.pilot_park_routes import PILOT_PARK_CENTERS


def _profile(**over):
    base = {"max_slope_percent": 3.0, "stairs_count": 0, "shade_ratio": 0.5,
            "soft_surface_ratio": 0.5, "surface_known_ratio": 1.0}
    return {**base, **over}


def _score(profile, **kw):
    kw.setdefault("distance_m", 1000.0)
    kw.setdefault("target_distance_m", 1000.0)
    return score_personalized(profile, **kw)


def test_joint_care_level_sets_the_slope_limit():
    profile = _profile(max_slope_percent=5.5)
    assert _score(profile, joint_care_level=0).slope == 25.0   # 상한 8%
    assert _score(profile, joint_care_level=3).slope == 12.0   # 상한 4%, 1.5배(6%) 이하
    assert _score(_profile(max_slope_percent=7.0), joint_care_level=3).slope == 0.0
    assert slope_limit_for(1, calibrated_max_slope=5.0) == 5.0  # 피드백으로 낮춘 상한이 더 엄격하면 그것을 쓴다
    assert JOINT_SLOPE_LIMIT[2] == 5.0


def test_shade_preference_favours_the_shadier_course():
    shady, sunny = _profile(shade_ratio=0.8), _profile(shade_ratio=0.2)
    default_gap = _score(shady).preference - _score(sunny).preference
    shade_gap = _score(shady, shade_priority=True).preference - _score(sunny, shade_priority=True).preference
    assert shade_gap > default_gap > 0


def test_soft_surface_preference_uses_known_surfaces_only():
    soft, hard = _profile(soft_surface_ratio=0.9), _profile(soft_surface_ratio=0.1)
    assert _score(soft, preferred_surfaces=["dirt"]).preference > _score(hard, preferred_surfaces=["dirt"]).preference
    unknown = _profile(soft_surface_ratio=0.0, surface_known_ratio=0.0)  # 송강처럼 노면 태그 없음
    assert _score(unknown, preferred_surfaces=["dirt"]).preference == _score(
        _profile(soft_surface_ratio=0.5), preferred_surfaces=["dirt"]).preference  # 모르는 값은 0.5


def test_unknown_data_gets_middle_scores_not_full_marks():
    result = _score({"max_slope_percent": 3.0, "stairs_count": None, "shade_ratio": None,
                     "soft_surface_ratio": None, "surface_known_ratio": None})
    assert result.stairs == 15.0 and result.thermal == 10.0 and result.preference == 7.5


def test_stairs_are_penalised_only_when_the_user_avoids_them():
    stairs = _profile(stairs_count=2)
    assert _score(stairs, avoid_stairs=True).stairs == 0.0
    assert _score(stairs, avoid_stairs=False).stairs == 15.0


def test_shade_cools_the_surface_temperature():
    assert cooled_surface_temp(30.0, 46.0, 1.0) == 34.0
    assert cooled_surface_temp(30.0, 46.0, None) == 46.0
    assert preference_weights(True, []) == {"shade": 0.7, "soft": 0.3}


def test_walk_plan_scores_change_with_the_dogs_joint_care_level():
    client = TestClient(main.app)
    lat, lon, _ = PILOT_PARK_CENTERS["yurim"]
    body = {"origin_lat": lat, "origin_lon": lon, "target_duration_minutes": 40, "origin_mode": "park",
            "pilot_park_id": "yurim", "speed_kmh": 2.8}

    def scores(extra):
        courses = client.post("/api/v1/walk/plan", json={**body, **extra}).json()["courses"]
        return [float(c["reason"].split("점수 ")[1].split("점")[0]) for c in courses]

    young, senior = scores({"joint_care_level": 0}), scores({"joint_care_level": 3})
    assert max(senior) <= max(young)
