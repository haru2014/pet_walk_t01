"""[#263] 공원 코스 카드에 순환 진입점(loop_entry_point)과 거기까지의 거리(approach_distance_m)를 내려 준다."""

import pytest
from types import SimpleNamespace

import main
from agent.park_walk_planner import plan_park_walk_candidates
from agent.pilot_park_routes import PILOT_PARK_CENTERS
from agent.route_geometry import polyline_length_m


@pytest.mark.parametrize("park", sorted(PILOT_PARK_CENTERS))
@pytest.mark.parametrize("minutes", [30, 60])
def test_route_knows_where_the_loop_starts(park, minutes):
    """진입점은 코스 위의 점이고, 출발지에서 그 점까지 처음 닿는 거리가 approach_m 과 같다."""
    lat, lon, _ = PILOT_PARK_CENTERS[park]
    for route in plan_park_walk_candidates(park, lat, lon, minutes * 2800 / 60):
        assert route.loop_entry in route
        first = route.index(route.loop_entry)
        assert polyline_length_m(route[: first + 1]) == pytest.approx(route.approach_m, abs=1.0)


def test_reversed_alternative_keeps_entry_fields():
    """반대 방향으로 채운 코스도 같은 진입점·거리를 가진다."""
    from agent.park_walk_planner import ParkRoute, _fill_with_reversed_routes

    base = [(ParkRoute([[0, 0], [1, 1]], lap_count=3, lap_cycle_m=9.0, loop_entry=[1, 1], approach_m=5.0), set(), None)]
    chosen: list = []
    _fill_with_reversed_routes(chosen, base, target_count=1)
    assert (chosen[0][0].loop_entry, chosen[0][0].approach_m) == ([1, 1], 5.0)


def _cand(**extra):
    return SimpleNamespace(
        route_id="candidate-loop-01", name="n", total_distance_m=1900, estimated_duration_minutes=30,
        surface_types=[], has_stairs=False, average_shade_ratio=0.0, max_slope_percent=1.0, lap_count=4,
        lap_cycle_m=131.0, **extra,
    )


def test_course_json_has_entry_fields_only_when_known():
    course = main._build_candidate_course(_cand(loop_entry=[127.1, 36.5], approach_m=412.34))
    assert course["loop_entry_point"] == [127.1, 36.5]
    assert course["approach_distance_m"] == 412.3
    plain = main._build_candidate_course(_cand())
    assert "loop_entry_point" not in plain and "approach_distance_m" not in plain
