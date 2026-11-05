"""[US-B3, US-20] 고른 환경 조건이 코스에 실제로 얼마나 반영됐는지 실측값으로 알리는 카드 문구.

UX_COMPACT_RULES 1번: 환경 한계로 조건을 다 맞추지 못하면 맞춘 척하지 않고 실제 비율로 안내한다.
문구는 카드 안내 칸(두 줄)에 들어가도록 짧게 쓴다. 조건을 확인할 자료가 없으면 그렇다고 말한다(GEMINI.md 원칙 8).
"""

from typing import Any, Dict, List, Mapping

from services.walk_preferences import WalkPreferences, selected_labels

ROAD_NOTICE_MIN_RATIO = 0.10     # 차가 적은 길: 차도 옆 구간이 이 비율 이상이면 알린다
MAJOR_NOTICE_MIN_RATIO = 0.15    # 조용한 길: 큰길 옆 구간이 이 비율 이상이면 알린다
CROSSING_NOTICE_MIN = 2
MAJOR_DETAIL_MIN_RATIO = 0.05    # 차도 옆 구간 중 큰길 비율이 이 이상이면 함께 적는다
CONTEXT_FIELDS = ("avoid_traffic", "prefer_quiet", "prefer_rest")


def _percent(ratio: float) -> int:
    return int(round(ratio * 100))


def _traffic_lines(exposure: Mapping[str, Any]) -> List[str]:
    lines: List[str] = []
    road = exposure.get("road_exposure_ratio")
    if road is not None and road >= ROAD_NOTICE_MIN_RATIO:
        major = exposure.get("major_road_ratio") or 0.0
        detail = f" (큰길 옆 {_percent(major)}%)" if major >= MAJOR_DETAIL_MIN_RATIO else ""
        lines.append(f"보행 전용로가 부족해 차도 옆 구간이 약 {_percent(road)}% 포함돼요{detail}")
    crossings = exposure.get("crossing_count") or 0
    if crossings >= CROSSING_NOTICE_MIN:
        lines.append(f"횡단보도를 {crossings}번 건너요")
    return lines


def _quiet_lines(exposure: Mapping[str, Any]) -> List[str]:
    major = exposure.get("major_road_ratio")
    if major is not None and major >= MAJOR_NOTICE_MIN_RATIO:
        return [f"한적한 길이 부족해 큰길 옆 구간이 약 {_percent(major)}%예요"]
    return []


def _rest_lines(exposure: Mapping[str, Any]) -> List[str]:
    count = exposure.get("rest_spot_count")
    if count is None:
        return []
    if count == 0:
        return ["코스 30m 안에 지도에 등록된 벤치·쉼터가 없어요"]
    return [f"코스 주변에 벤치·쉼터 {count}곳이 있어요"]


def preference_notice_lines(prefs: WalkPreferences, exposure: Mapping[str, Any], preference_routed: bool) -> List[str]:
    """카드에 붙일 안내 줄 목록 (중요한 것부터).

    preference_routed: 이 코스를 조건 비용으로 찾았는지 (현재 위치 모드에서 OSM 그래프 탐색 실패 시 False).
    """
    if not prefs.needs_road_context:
        return []
    if exposure.get("exposure_source") is None:
        labels = "·".join(selected_labels(prefs, CONTEXT_FIELDS))
        return [f"주변 길 정보를 불러오지 못해 '{labels}' 조건을 확인하지 못했어요"]
    lines: List[str] = []
    if not preference_routed:
        lines.append("조건을 반영한 길 찾기에 실패해 일반 보행 경로로 안내해요")
    if prefs.avoid_traffic:
        lines.extend(_traffic_lines(exposure))
    if prefs.prefer_quiet:
        lines.extend(_quiet_lines(exposure))
    if prefs.prefer_rest:
        lines.extend(_rest_lines(exposure))
    return lines


def append_notice_lines(course: Dict[str, Any], lines: List[str]) -> None:
    """카드 안내 칸(notice)에 줄을 덧붙인다. 기존 안내(짧은 공원 코스 등)는 앞에 둔다."""
    if not lines:
        return
    existing = [course["notice"]] if course.get("notice") else []
    course["notice"] = "\n".join(existing + lines)
