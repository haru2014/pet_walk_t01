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


def _cand(distance_m, minutes, lap_count=1, lap_cycle_m=None):
    return SimpleNamespace(total_distance_m=distance_m, estimated_duration_minutes=minutes,
                           lap_count=lap_count, lap_cycle_m=lap_cycle_m)


def test_lap_limit_notice_fits_in_one_card_line():
    assert len(main.LAP_LIMIT_NOTICE_TEXT.format(laps=2, minutes=120)) <= 20


def test_lap_limit_notice_for_course_shortened_by_two_lap_limit():
    """송강 60분(2.8km) 예: 694m 순환로 2바퀴 = 1.4km. 한 바퀴 더 돌면 목표에 가까워지므로 2바퀴 제한 때문에 짧아진 코스다."""
    courses = [{"reason": "맞춤 점수 80점"}]
    marked = main._add_lap_limit_notice(courses, [_cand(1400, 30, lap_count=2, lap_cycle_m=694.0)], 2800)
    assert marked == {0}
    assert courses[0]["notice"] == "2바퀴까지만 돌아 약 30분이에요"
    assert "2바퀴까지만 추천해요" in courses[0]["reason"]
    assert "순환로(약 694m)를 2바퀴 반복하는 코스입니다." in courses[0]["reason"]


def test_no_lap_limit_notice_when_course_reaches_target():
    courses = [{"reason": "a"}]
    assert main._add_lap_limit_notice(courses, [_cand(2500, 54, lap_count=2, lap_cycle_m=1200.0)], 2800) == set()
    assert courses == [{"reason": "a"}]


def test_no_lap_limit_notice_for_one_lap_course():
    """1바퀴 코스는 2바퀴 제한과 무관하다 (더 돌 수 있었다면 플래너가 2바퀴를 골랐다)."""
    courses = [{"reason": "a"}]
    assert main._add_lap_limit_notice(courses, [_cand(1000, 21, lap_count=1, lap_cycle_m=900.0)], 2800) == set()


def test_lap_limit_notice_boundary_at_80_percent():
    """목표의 80% 이상이면 2바퀴여도 안내하지 않고, 80% 미만이면 안내한다."""
    at_80 = [{"reason": "a"}]
    assert main._add_lap_limit_notice(at_80, [_cand(2240, 48, lap_count=2, lap_cycle_m=1000.0)], 2800) == set()
    below_80 = [{"reason": "a"}]
    assert main._add_lap_limit_notice(below_80, [_cand(2239, 47, lap_count=2, lap_cycle_m=1000.0)], 2800) == {0}


def test_lap_limit_notice_is_per_card_even_when_another_card_reaches_target():
    """#259 와 달리 카드마다 판단: 1안이 목표를 채워도 2바퀴 제한으로 짧아진 대안 카드에는 이유를 알린다."""
    courses = [{"reason": "a"}, {"reason": "b"}]
    cands = [_cand(2800, 60, lap_count=1, lap_cycle_m=2700.0), _cand(1000, 21, lap_count=2, lap_cycle_m=500.0)]
    assert main._add_lap_limit_notice(courses, cands, 2800) == {1}
    assert "notice" not in courses[0]
    assert courses[1]["notice"] == "2바퀴까지만 돌아 약 21분이에요"


def test_short_course_notice_skips_lap_limited_cards():
    """같은 카드에 '산책로가 짧아'와 '2바퀴까지만' 안내를 겹쳐 붙이지 않는다."""
    courses = [{"reason": "a"}, {"reason": "b"}]
    cands = [_cand(1400, 30, lap_count=2, lap_cycle_m=694.0), _cand(900, 19, lap_count=1, lap_cycle_m=850.0)]
    marked = main._add_lap_limit_notice(courses, cands, 2800)
    main._add_short_course_notice(courses, cands, 2800, skip_indexes=marked)
    assert courses[0]["notice"] == "2바퀴까지만 돌아 약 30분이에요"
    assert courses[1]["notice"] == "산책로가 짧아 최대 약 30분이에요"
