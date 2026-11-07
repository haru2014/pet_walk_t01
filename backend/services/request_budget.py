"""[US-A3] 코스 생성 한 요청이 외부 조회에 쓸 수 있는 시간을 한곳에서 나눠 준다.

앱은 요청을 보낸 뒤 20초가 지나면 취소한다(frontend/src/services/api.ts 의 API_TIMEOUT_MS).
예전에는 날씨(최대 10초)·주변 길 조회(최대 8초)·OSRM(6초)이 서로 모르는 예산을 따로 가지고 있어
합계가 20초를 넘었다. 처음 보는 지역의 첫 요청은 세 조회가 모두 느려 앱이 먼저 취소했고,
사용자에게는 '경로를 생성하지 못했습니다'로 보였다.

이 모듈은 요청 하나에 데드라인 한 개를 두고, 단계마다 "지금 쓸 수 있는 시간"을 돌려준다.
남은 시간이 없으면 0 을 돌려주므로 호출자는 외부 조회를 건너뛰고 가진 자료로 응답한다.
"""

import time
from dataclasses import dataclass
from typing import Optional

TOTAL_BUDGET_S = 13.0    # 앱 제한 20초 - 통신·직렬화·응답 여유 7초
WEATHER_MAX_S = 4.0      # 날씨 몫. 못 받으면 추정값으로 대체되므로 길게 기다리지 않는다
OVERPASS_MAX_S = 6.0     # 주변 길 조회 몫. 못 받으면 OSRM 경로로 돌아간다
OSRM_MAX_S = 6.0         # OSRM 몫 (loop_route_planner.PLAN_TIME_BUDGET_S 와 같은 값)
OSRM_RESERVE_S = 4.0     # 앞 단계가 느려도 OSRM 에 남겨 두는 최소 시간
MIN_CALL_S = 1.0         # 이보다 짧게 남으면 기다릴 가치가 없다


@dataclass(frozen=True)
class RequestBudget:
    """요청 시작 시각 기준 데드라인(time.monotonic 기준 초)."""

    deadline: float

    @classmethod
    def start(cls, total_s: float = TOTAL_BUDGET_S) -> "RequestBudget":
        return cls(deadline=time.monotonic() + total_s)

    def remaining_s(self) -> float:
        return max(0.0, self.deadline - time.monotonic())

    def weather_s(self) -> float:
        """날씨 조회에 줄 시간. 뒤 단계(주변 길·OSRM) 몫을 남겨 둔다."""
        return _share(self.remaining_s() - OSRM_RESERVE_S - MIN_CALL_S, WEATHER_MAX_S)

    def overpass_s(self) -> float:
        """주변 길(Overpass) 조회에 줄 시간. OSRM 몫을 남겨 둔다."""
        return _share(self.remaining_s() - OSRM_RESERVE_S, OVERPASS_MAX_S)

    def osrm_s(self) -> float:
        """OSRM 경로 탐색에 줄 시간. 남은 시간을 모두 쓰되 평소 예산을 넘지는 않는다."""
        return max(MIN_CALL_S, min(OSRM_MAX_S, self.remaining_s()))


def _share(available_s: float, cap_s: float) -> float:
    """쓸 수 있는 시간을 상한 안에서 돌려준다. 기다릴 가치가 없으면 0."""
    usable = min(cap_s, available_s)
    return usable if usable >= MIN_CALL_S else 0.0


def deadline_of(budget: Optional[RequestBudget]) -> Optional[float]:
    """상태(state)에 넣어 나르기 위한 데드라인 숫자. 예산이 없으면 None."""
    return None if budget is None else budget.deadline


def budget_from(deadline: Optional[float]) -> Optional[RequestBudget]:
    """상태에서 꺼낸 데드라인 숫자를 예산으로 되돌린다. None 이면 예산 없음(기존 동작)."""
    return None if deadline is None else RequestBudget(deadline=float(deadline))
