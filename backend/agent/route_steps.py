"""[US-C1, US-C2] 경로 지오메트리 기반 턴 바이 턴 안내 스텝 생성기.

스텝은 실제 경로 좌표열에서만 도출하므로 안내 핀은 항상 경로 위에 놓이고,
스텝별 거리의 합계는 코스 전체 실측 거리와 일치한다.
"""

from typing import Any, Dict, List

from agent.route_geometry import bearing_deg, cumulative_distances_m, haversine_m

ANCHOR_SPACING_M = 20.0
TURN_ANGLE_THRESHOLD_DEG = 40.0
SHARP_TURN_ANGLE_DEG = 120.0
MIN_TURN_SPACING_M = 40.0
DEFAULT_MAX_STEPS = 10


def _signed_turn_deg(prev_bearing: float, next_bearing: float) -> float:
    """진행 방향 변화량(-180~180). 양수는 우회전, 음수는 좌회전."""
    return (next_bearing - prev_bearing + 540.0) % 360.0 - 180.0


def _anchor_indices(coords: List[List[float]]) -> List[int]:
    """곡선 노이즈를 줄이기 위해 약 20m 간격으로 솎아낸 좌표 인덱스를 반환한다."""
    anchors = [0]
    since_last = 0.0
    for i in range(1, len(coords)):
        since_last += haversine_m(coords[i - 1], coords[i])
        if since_last >= ANCHOR_SPACING_M:
            anchors.append(i)
            since_last = 0.0
    if anchors[-1] != len(coords) - 1:
        anchors.append(len(coords) - 1)
    return anchors


def _detect_turns(coords: List[List[float]], cumulative: List[float]) -> List[Dict[str, Any]]:
    """회전각이 임계치 이상인 지점(인덱스, 회전각)을 경로 순서대로 검출한다."""
    anchors = _anchor_indices(coords)
    turns: List[Dict[str, Any]] = []
    for k in range(1, len(anchors) - 1):
        before = bearing_deg(coords[anchors[k - 1]], coords[anchors[k]])
        after = bearing_deg(coords[anchors[k]], coords[anchors[k + 1]])
        angle = _signed_turn_deg(before, after)
        if abs(angle) < TURN_ANGLE_THRESHOLD_DEG:
            continue
        idx = anchors[k]
        if turns and cumulative[idx] - cumulative[turns[-1]["index"]] < MIN_TURN_SPACING_M:
            if abs(angle) > abs(turns[-1]["angle"]):
                turns[-1] = {"index": idx, "angle": angle}
            continue
        turns.append({"index": idx, "angle": angle})
    return turns


def _turn_instruction(angle: float) -> str:
    side = "우회전" if angle > 0 else "좌회전"
    if abs(angle) >= SHARP_TURN_ANGLE_DEG:
        return f"크게 {side}하여 보행로를 따라 이동하세요."
    return f"{side}하여 보행로를 따라 이동하세요."


def _limit_turns(turns: List[Dict[str, Any]], max_steps: int) -> List[Dict[str, Any]]:
    """안내 단계가 너무 많으면 회전각이 큰 지점을 우선 남긴다."""
    limit = max(0, max_steps - 1)
    if len(turns) <= limit:
        return turns
    largest = sorted(turns, key=lambda t: abs(t["angle"]), reverse=True)[:limit]
    return sorted(largest, key=lambda t: t["index"])


def build_turn_steps(coords: List[List[float]], max_steps: int = DEFAULT_MAX_STEPS) -> List[Dict[str, Any]]:
    """좌표열에서 턴 바이 턴 스텝을 생성한다.

    각 스텝은 안내 지점(position)에서 다음 안내 지점까지의 거리(distance_m)를 가지며,
    정수 거리의 합계는 코스 실측 총거리와 정확히 일치한다.
    """
    if len(coords) < 2:
        return []
    cumulative = cumulative_distances_m(coords)
    turns = _limit_turns(_detect_turns(coords, cumulative), max_steps)

    boundaries = [0] + [t["index"] for t in turns] + [len(coords) - 1]
    instructions = ["출발지에서 보행로를 따라 직진하세요."] + [_turn_instruction(t["angle"]) for t in turns]

    total_m = round(cumulative[-1])
    steps: List[Dict[str, Any]] = []
    used_m = 0
    for i, instruction in enumerate(instructions):
        is_last = i == len(instructions) - 1
        leg_m = total_m - used_m if is_last else round(cumulative[boundaries[i + 1]] - cumulative[boundaries[i]])
        used_m += leg_m
        steps.append({
            "instruction": instruction,
            "distance_m": max(0, leg_m),
            "position": list(coords[boundaries[i]]),
        })
    return steps
