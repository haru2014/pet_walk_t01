"""Issue #153 후속: 33℃ 안전 기준과 무일사 1.6℃ 보정이 서버 전체에서 같은 값을 쓰는지 확인 (#156 검토)."""

from types import SimpleNamespace

import pytest

import main
from services.weather_context import NO_SUN_SURFACE_OFFSET_C, SAFE_MAX_C, calculate_surface_temps


def _park_briefing(surface_temp: float) -> str:
    agent_result = SimpleNamespace(briefing_message="")
    best = SimpleNamespace(route_id="r1", name="유림 1안", estimated_duration_minutes=40, total_distance_m=1860)
    weather = {"current": {"estimated_surface_temp": surface_temp}, "golden_time_window": "19:00 ~ 21:00"}
    main._update_park_briefing(agent_result, best, weather, {"r1": {"duration_is_alternative": False}})
    return agent_result.briefing_message


def test_park_briefing_warns_between_33_and_35():
    assert SAFE_MAX_C == 33.0
    assert "그늘 숲길" in _park_briefing(34.0)  # 예전 35℃ 기준에서는 경고가 빠지던 구간
    assert "그늘 숲길" not in _park_briefing(33.0)


@pytest.mark.parametrize("air, weight", [(20.0, 0.0), (28.0, 0.6), (31.5, 1.0)])
def test_fallback_surface_temps_match_weather_context(air, weight):
    fallback = main._fallback_surface_temps(air, weight)
    expected = calculate_surface_temps(air, weight)
    assert fallback == {k: expected[k] for k in ("asphalt", "paved", "dirt", "grass")}


def test_no_sun_offset_applied_at_night():
    assert main._fallback_surface_temps(20.0, 0.0)["asphalt"] == round(20.0 + NO_SUN_SURFACE_OFFSET_C, 1)
