import math

from agent.route_steps import build_turn_steps


def _route_with_headings(headings, segment_m=25.0):
    """Create a polyline with one fixed-length segment for each compass heading."""
    lat = 37.5
    lon = 127.0
    coords = [[lon, lat]]
    for heading in headings:
        radians = math.radians(heading)
        lat += segment_m * math.cos(radians) / 111_195
        lon += segment_m * math.sin(radians) / (111_195 * math.cos(math.radians(lat)))
        coords.append([lon, lat])
    return coords


def test_keeps_every_turn_even_when_route_has_more_than_nine_turns():
    headings = [0, 90, 0, 90, 0, 90, 0, 90, 0, 90, 0, 90]
    steps = build_turn_steps(_route_with_headings(headings))

    assert len(steps) == len(headings)
    assert sum(step["distance_m"] for step in steps) == 300
    assert all("우회전" in step["instruction"] for step in steps[1::2])
    assert all("좌회전" in step["instruction"] for step in steps[2::2])


def test_keeps_close_direction_changes_and_announces_uturn():
    # 각 선분이 25m이므로 기존 40m 간격 병합은 인접 회전을 누락시켰다.
    steps = build_turn_steps(_route_with_headings([0, 90, 270, 0]))

    assert len(steps) == 4
    assert "우회전" in steps[1]["instruction"]
    assert "유턴" in steps[2]["instruction"]
    assert "우회전" in steps[3]["instruction"]
