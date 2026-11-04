"""[#257] 같은 순환로는 2바퀴까지만 우선하고, 3바퀴 이상은 다른 방법이 없을 때만 쓰며 카드에 이유를 알린다."""

from types import SimpleNamespace

import pytest

import main
from agent.park_walk_planner import PREFERRED_LAP_REPEATS, plan_park_walk_candidates

CENTERS = {
    "yurim": (36.3620608, 127.3601379),
    "sejong": (36.4972593, 127.2749633),
    "songgang": (36.4353, 127.3847),
    "doan": (36.332629, 127.3505325),
}


def _target(minutes, speed=2.8):
    return speed * 1000.0 / 60.0 * minutes


def _laps(route):
    return getattr(route, "lap_count", 1)


def test_preferred_lap_limit_is_two():
    assert PREFERRED_LAP_REPEATS == 2


@pytest.mark.parametrize("park", list(CENTERS))
def test_two_lap_courses_come_before_three_or_more(park):
    """풀 안에서 3바퀴 이상 코스는 2바퀴 이하 코스보다 앞에 오지 않는다 (1안 기준)."""
    lat, lon = CENTERS[park]
    routes = plan_park_walk_candidates(park, lat, lon, _target(60))
    laps = [_laps(r) for r in routes]
    if any(count <= PREFERRED_LAP_REPEATS for count in laps):
        assert laps[0] <= PREFERRED_LAP_REPEATS, laps


def test_extra_lap_notice_is_added_only_for_three_or_more_laps():
    courses = [{"reason": "a"}, {"reason": "b"}, {"reason": "c"}]
    cands = [SimpleNamespace(lap_count=1), SimpleNamespace(lap_count=2), SimpleNamespace(lap_count=3)]
    main._add_extra_lap_notice(courses, cands)
    assert "notice" not in courses[0] and "notice" not in courses[1]
    assert courses[2]["notice"] == "공원이 작아 같은 길을 3바퀴 돌아요."
    assert "3바퀴" in courses[2]["reason"]

