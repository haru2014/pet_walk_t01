"""[편안하개 - PetWalk] 서버가 켜질 때 코스 생성에 쓰는 계산을 미리 해 둔다 (이슈 #125).

공원 보행망 그래프와 구간 경사(DEM 고도)는 입력이 같으면 결과가 항상 같다. 이를 서버가 켜진 직후
백그라운드에서 한 번 계산해 두면, 첫 사용자의 코스 요청도 기억해 둔 값을 쓴다.
실패해도 서버는 그대로 동작한다(요청 때 다시 계산한다). /health 는 막지 않는다.
"""

import logging
import os
import threading
import time
from typing import Callable, Dict, Iterable, List, Optional, Tuple

logger = logging.getLogger("petwalk.warmup")

WARMUP_DELAY_S = 2.0  # 서버가 첫 요청(헬스체크 등)을 받을 시간을 준다
WEATHER_REFRESH_S = 480.0  # 날씨 캐시 유효시간(10분)이 끝나기 전(8분)에 미리 새로 받는다
ACTIVE_WINDOW_S = 900.0  # 이 시간(15분) 안에 사용자 요청이 있었을 때만 날씨를 미리 갱신한다 (아무도 안 쓰면 외부 호출을 아낀다)
_STOP = threading.Event()
_LAST_ACTIVITY = time.time()


def mark_activity() -> None:
    """사용자 요청이 들어온 시각을 기록한다."""
    global _LAST_ACTIVITY
    _LAST_ACTIVITY = time.time()


def _recently_active() -> bool:
    return time.time() - _LAST_ACTIVITY < ACTIVE_WINDOW_S


def warm_park_caches(park_ids: Optional[Iterable[str]] = None) -> Dict[str, dict]:
    """공원별 그래프를 만들고, 그래프의 모든 구간 경사를 한 번씩 계산해 고도 캐시를 채운다."""
    from agent.park_route_validation import RoutePlanningError, build_park_graph
    from agent.pilot_park_routes import PILOT_PARK_COORDS_MAP
    from agent.surface_slope_evaluator import calculate_segment_slope_percent

    summary: Dict[str, dict] = {}
    for park_id in (list(park_ids) if park_ids is not None else list(PILOT_PARK_COORDS_MAP)):
        started = time.monotonic()
        try:
            graph = build_park_graph(park_id)
        except RoutePlanningError as err:
            summary[park_id] = {"error": err.code}
            logger.warning("워밍업 건너뜀: park=%s code=%s", park_id, err.code)
            continue
        except Exception as err:  # 워밍업 실패가 서버를 멈추면 안 된다
            summary[park_id] = {"error": type(err).__name__}
            logger.warning("워밍업 건너뜀: park=%s error=%s", park_id, type(err).__name__)
            continue
        failed = 0
        edges = list(graph.edges)
        for a, b in edges:
            try:
                calculate_segment_slope_percent(a, b)
            except Exception:
                failed += 1
        try:  # 공원 순환 후보도 미리 찾아 둔다 (공원별 첫 요청이 이 계산을 기다리지 않게)
            from agent.park_walk_planner import warm_park_cycles
            warm_park_cycles(graph)
        except Exception as err:
            logger.warning("순환 워밍업 건너뜀: park=%s error=%s", park_id, type(err).__name__)
        summary[park_id] = {"edges": len(edges), "failed": failed}
        logger.info("워밍업 완료: park=%s edges=%d failed=%d %.1fs", park_id, len(edges), failed, time.monotonic() - started)
    return summary


def refresh_weather_once(fetch: Callable[..., object], points: Iterable[Tuple[float, float]]) -> int:
    """공원 대표점마다 날씨를 캐시를 건너뛰고 새로 받아 둔다. 성공한 개수를 돌려준다. 실패해도 계속한다."""
    ok = 0
    for lat, lon in points:
        try:
            fetch(lat, lon, force_refresh=True)
            ok += 1
        except Exception as err:  # noqa: BLE001 - 날씨 갱신 실패가 서버를 멈추면 안 된다
            logger.warning("날씨 미리 받기 실패: %s", type(err).__name__)
    return ok


def stop_background_warmup() -> None:
    """주기 갱신 루프를 멈춘다. (테스트·종료용)"""
    _STOP.set()


def start_background_warmup(
    weather_fetch: Optional[Callable[..., object]] = None,
    weather_points: Optional[List[Tuple[float, float]]] = None,
) -> Optional[threading.Thread]:
    """백그라운드(데몬 스레드)에서 워밍업을 시작한다. pytest 실행 중이거나 PETWALK_DISABLE_WARMUP 이면 하지 않는다.

    1) 공원 그래프·구간 고도를 미리 계산하고
    2) weather_fetch 가 주어지면 공원 대표점의 날씨를 미리 받고, 캐시가 만료되기 전에 주기적으로 갱신한다.
       (첫 요청이 외부 날씨 서버를 기다리며 약 3초 이상 걸리던 것을 없앤다)
    """
    if "PYTEST_CURRENT_TEST" in os.environ:
        return None
    if os.environ.get("PETWALK_DISABLE_WARMUP", "").strip().lower() in {"1", "true", "yes", "on"}:
        return None
    _STOP.clear()
    mark_activity()  # 서버가 방금 켜졌으니 첫 갱신은 한다

    def _run() -> None:
        time.sleep(WARMUP_DELAY_S)
        try:
            warm_park_caches()
        except Exception as err:  # noqa: BLE001
            logger.warning("워밍업 실패: %s", type(err).__name__)
        if weather_fetch is None or not weather_points:
            return
        while not _STOP.is_set():
            if _recently_active():  # 서버가 방금 켜졌거나 최근 요청이 있었을 때만 (기상청·에어코리아 호출 한도 보호)
                refresh_weather_once(weather_fetch, weather_points)
            _STOP.wait(WEATHER_REFRESH_S)

    thread = threading.Thread(target=_run, name="petwalk-warmup", daemon=True)
    thread.start()
    return thread
