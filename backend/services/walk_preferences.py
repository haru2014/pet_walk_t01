"""[US-A1, US-B1, US-20] 앱 산책 설정의 환경 조건 6종을 경로 탐색이 쓰는 한 형태로 모은다.

앱(WalkSettingsView)의 칩 id 와 요청 필드의 대응 (SSOT):
| 칩 id   | 화면 문구        | 요청 불리언       | 의도(WalkIntent) 필드 |
|---------|------------------|-------------------|----------------------|
| soft    | 폭신한 길        | prefer_cushion    | preferred_surfaces    |
| shade   | 그늘이 많은 길   | prefer_shade      | shade_priority        |
| stairs  | 계단 피하기      | avoid_stairs      | avoid_stairs          |
| traffic | 차가 적은 길     | avoid_traffic     | avoid_traffic         |
| quiet   | 조용한 길        | prefer_quiet      | prefer_quiet          |
| rest    | 쉬어가기 좋은 길 | prefer_rest       | prefer_rest           |

앱은 불리언 필드와 함께 고른 칩 목록(`environments`)을 보낸다. 불리언이 있으면 그것을, 없으면 목록을 쓴다.
"""

from typing import Any, Dict, Iterable, Mapping, Optional

from pydantic import BaseModel

SOFT_SURFACES = ("dirt", "grass", "rubber")

# 칩 id → 요청 불리언 필드
ENVIRONMENT_REQUEST_FIELDS: Dict[str, str] = {
    "soft": "prefer_cushion",
    "shade": "prefer_shade",
    "stairs": "avoid_stairs",
    "traffic": "avoid_traffic",
    "quiet": "prefer_quiet",
    "rest": "prefer_rest",
}

# 요청 불리언 필드 → 의도(WalkIntent) 덮어쓰기 키 (main._app_intent_overrides 가 쓴다)
REQUEST_INTENT_KEYS: Dict[str, str] = {
    "avoid_stairs": "avoid_stairs",
    "prefer_shade": "shade_priority",
    "prefer_cushion": "prefer_soft",
    "avoid_traffic": "avoid_traffic",
    "prefer_quiet": "prefer_quiet",
    "prefer_rest": "prefer_rest",
}


class WalkPreferences(BaseModel):
    """경로 탐색 비용과 결과 안내에 쓰는 환경 조건."""
    prefer_soft: bool = False
    prefer_shade: bool = False
    avoid_stairs: bool = False
    avoid_traffic: bool = False
    prefer_quiet: bool = False
    prefer_rest: bool = False

    @property
    def shapes_route(self) -> bool:
        """길 선택(간선 비용)을 바꾸는 조건이 하나라도 켜져 있는지."""
        return any((self.prefer_soft, self.prefer_shade, self.avoid_stairs,
                    self.avoid_traffic, self.prefer_quiet, self.prefer_rest))

    @property
    def needs_road_context(self) -> bool:
        """차도·쉼터처럼 주변 OSM 정보가 있어야 확인할 수 있는 조건이 켜져 있는지."""
        return self.avoid_traffic or self.prefer_quiet or self.prefer_rest

    @classmethod
    def from_intent(cls, intent: Optional[Mapping[str, Any]]) -> "WalkPreferences":
        """에이전트가 정리한 의도(WalkIntent dict)에서 만든다."""
        intent = intent or {}
        surfaces = intent.get("preferred_surfaces") or []
        return cls(
            prefer_soft=any(s in SOFT_SURFACES for s in surfaces),
            prefer_shade=bool(intent.get("shade_priority", False)),
            avoid_stairs=bool(intent.get("avoid_stairs", False)),
            avoid_traffic=bool(intent.get("avoid_traffic", False)),
            prefer_quiet=bool(intent.get("prefer_quiet", False)),
            prefer_rest=bool(intent.get("prefer_rest", False)),
        )


def request_flags(req: Mapping[str, Any]) -> Dict[str, bool]:
    """요청의 환경 조건을 불리언 필드 이름으로 정리한다. 앱이 보내지 않은 조건은 넣지 않는다.

    불리언 필드가 있으면 그 값을 쓰고, 없으면 `environments` 칩 목록에 들어 있는지로 정한다.
    """
    environments = _environment_ids(req.get("environments"))
    flags: Dict[str, bool] = {}
    for env_id, field in ENVIRONMENT_REQUEST_FIELDS.items():
        value = req.get(field)
        if isinstance(value, bool):
            flags[field] = value
        elif environments is not None:
            flags[field] = env_id in environments
    return flags


def _environment_ids(raw: Any) -> Optional[set]:
    if not isinstance(raw, (list, tuple)):
        return None
    return {item for item in raw if isinstance(item, str)}


def intent_overrides_from_request(req: Mapping[str, Any]) -> Dict[str, bool]:
    """요청 불리언 → 의도 덮어쓰기 사전. 보내지 않은 항목은 넣지 않는다."""
    return {REQUEST_INTENT_KEYS[field]: value for field, value in request_flags(req).items()}


def selected_labels(prefs: WalkPreferences, fields: Iterable[str]) -> list:
    """안내 문구에 쓸 칩 이름 목록 (켜진 조건만)."""
    labels = {"avoid_traffic": "차가 적은 길", "prefer_quiet": "조용한 길", "prefer_rest": "쉬어가기 좋은 길"}
    return [labels[f] for f in fields if getattr(prefs, f, False) and f in labels]
