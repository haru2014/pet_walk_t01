"""[US-A3, US-20] 순환 코스 후보끼리 비교하는 벌점(낮을수록 좋다).

예전에는 후보를 거리 오차만으로 골랐다. 그래서 왕복 28%인 길이 오차가 조금 더 작다는 이유로 뽑혔다가
상위 단계의 왕복 기준(15%)에서 탈락해, 조건을 반영한 코스가 통째로 버려지는 일이 생겼다.
이 모듈은 거리 오차·왕복 비율·회전 밀도를 한 점수로 합쳐, 뽑힌 후보가 위에서 버려지지 않게 한다.

- 거리 오차: |실측 - 목표| / 목표
- 왕복 비율: 기준(MAX_BACKTRACK)을 넘은 만큼만 벌점
- 회전 밀도: '조용한 길'이 켜졌을 때만. 100m 당 꺾는 횟수가 기준을 넘은 만큼 벌점
"""

from typing import Sequence

from agent.route_geometry import backtrack_ratio, turn_density
from services.walk_preferences import WalkPreferences

MAX_BACKTRACK = 0.15        # loop_route_planner.MAX_BACKTRACK_RATIO 와 같은 값 (위에서 쓰는 기준)
BACKTRACK_WEIGHT = 3.0
# 100m 당 0.6번(약 170m 에 한 번)까지는 보통 길로 본다.
#   한 블록(300m 안팎)을 돌아 나오는 순환은 0.3~0.4, 100m 마다 꺾는 지그재그는 0.8 이상이다.
QUIET_TURN_BUDGET = 0.6
QUIET_TURN_WEIGHT = 0.25


def backtrack_penalty(coords: Sequence[Sequence[float]]) -> float:
    """기준을 넘은 왕복 비율에만 붙는 벌점."""
    return BACKTRACK_WEIGHT * max(0.0, backtrack_ratio(coords) - MAX_BACKTRACK)


def complexity_penalty(coords: Sequence[Sequence[float]], prefs: WalkPreferences) -> float:
    """조용한 길: 자주 꺾는 복잡한 경로에 붙는 벌점. 조건이 꺼져 있으면 0."""
    if not prefs.prefer_quiet:
        return 0.0
    return QUIET_TURN_WEIGHT * max(0.0, turn_density(coords) - QUIET_TURN_BUDGET)


def loop_penalty(coords: Sequence[Sequence[float]], length_m: float, target_m: float,
                 prefs: WalkPreferences) -> float:
    """후보 하나의 벌점. 낮은 쪽을 고른다."""
    error = abs(length_m - target_m) / target_m if target_m > 0 else 0.0
    return error + backtrack_penalty(coords) + complexity_penalty(coords, prefs)
