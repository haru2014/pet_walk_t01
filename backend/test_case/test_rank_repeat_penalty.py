"""같은 길을 되풀이하는 코스는 대안이 있을 때만 추천 순위에서 뒤로 민다.

순서: 요청 시간 적합 → 3바퀴 이상 반복 여부 → 같은 길 되밟기 비율 → 점수.
"""

from agent.walk_planning_agent import (
    MAX_PREFERRED_LAPS,
    RouteCandidate,
    ScoredRoute,
    rank_key,
    repeat_penalty,
)

# 서로 다른 길만 지나는 사각 순환 (경도, 위도)
LOOP = [[127.000, 36.000], [127.001, 36.000], [127.001, 36.001], [127.000, 36.001], [127.000, 36.000]]
# 같은 길을 되돌아오는 코스: 앞 구간을 한 번 더 걷는다
RETRACE = LOOP + LOOP[1:3][::-1] + [LOOP[0]]


def _scored(coords, lap_count=1, score=80.0, err=0.0):
    candidate = RouteCandidate(
        route_id="r", name="r", total_distance_m=1000.0, estimated_duration_minutes=20.0,
        geojson_coordinates=coords, lap_count=lap_count,
    )
    return ScoredRoute(
        candidate=candidate, total_score=score, stairs_score=0, slope_score=0, thermal_score=0,
        distance_score=0, rank=1, distance_error_ratio=err,
    )


def test_preferred_lap_limit_matches_park_planner():
    from agent.park_walk_planner import PREFERRED_LAP_REPEATS
    assert MAX_PREFERRED_LAPS == PREFERRED_LAP_REPEATS


def test_loop_without_repeats_has_no_penalty():
    assert repeat_penalty(_scored(LOOP).candidate) == (0, 0.0)


def test_lap_repetition_alone_is_not_counted_as_retrace():
    """2바퀴는 같은 길을 한 번 더 도는 것이지만 되밟기 몫으로 세지 않는다 (바퀴 수 규칙으로 따로 다룬다)."""
    two_laps = LOOP + LOOP[1:]
    assert repeat_penalty(_scored(two_laps, lap_count=2).candidate) == (0, 0.0)


def test_three_laps_are_flagged():
    three_laps = LOOP + LOOP[1:] + LOOP[1:]
    laps_over, _ = repeat_penalty(_scored(three_laps, lap_count=3).candidate)
    assert laps_over == 1


def test_retrace_raises_penalty_bucket():
    _, bucket = repeat_penalty(_scored(RETRACE).candidate)
    assert bucket > 0.0


def test_fitting_one_lap_beats_fitting_three_laps_even_with_lower_score():
    one_lap = _scored(LOOP, lap_count=1, score=70.0)
    three_laps = _scored(LOOP + LOOP[1:] + LOOP[1:], lap_count=3, score=95.0)
    assert sorted([three_laps, one_lap], key=rank_key)[0] is one_lap


def test_less_retrace_beats_more_retrace_when_both_fit():
    clean = _scored(LOOP, score=70.0)
    retraced = _scored(RETRACE, score=95.0)
    assert sorted([retraced, clean], key=rank_key)[0] is clean


def test_score_decides_when_repetition_is_equal():
    low = _scored(LOOP, score=60.0)
    high = _scored(LOOP, score=90.0)
    assert sorted([low, high], key=rank_key)[0] is high


def test_time_fit_still_comes_first():
    """시간에 맞는 3바퀴 코스가 시간에서 먼 1바퀴 코스보다 앞선다 (#170 유지)."""
    fits_three_laps = _scored(LOOP + LOOP[1:] + LOOP[1:], lap_count=3, err=0.05)
    far_one_lap = _scored(LOOP, lap_count=1, err=0.60)
    assert sorted([far_one_lap, fits_three_laps], key=rank_key)[0] is fits_three_laps


def test_candidate_without_coordinates_has_no_penalty():
    assert repeat_penalty(_scored([]).candidate) == (0, 0.0)
