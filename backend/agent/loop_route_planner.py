"""[US-A3, US-B3] 출발지 기반 동적 순환 코스 생성기.

사용자의 실제 출발 좌표와 목표 거리에서 원형 웨이포인트를 만들고,
OSRM 보행 라우팅(Footway) 결과의 실측 거리가 목표에서 벗어나면 웨이포인트 반경을 보정한다.
3개 대안 코스(방향별)는 병렬로 질의하고, 각 코스의 반경 보정도 배율 3종을 동시에 질의해 응답 지연(목표 ≤1.5초)을 줄인다.

오프라인(OSRM 실패) 시에는 서울광장 인근 한정 정적 도로망 좌표 또는
목표 거리에 맞춘 직사각형 폴백을 사용한다. 직사각형 폴백은 건물을 관통할 수 있는 임시 대체 수단이다.
"""

import logging
import math
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from shapely.geometry import MultiPoint

from agent.road_network_routes import (
    V1_ROAD_ALIGNED_COORDS,
    V2_ROAD_ALIGNED_COORDS,
    V3_ROAD_ALIGNED_COORDS,
    fetch_osrm_foot_route,
)
from agent.offline_walk_network import plan_offline_network_loop
from agent.pilot_park_routes import resolve_pilot_park_key
from agent.route_geometry import (
    backtrack_ratio,
    collapse_backtracks,
    destination_point,
    haversine_m,
    loop_closure_gap_m,
    polyline_length_m,
)
from agent.route_steps import build_turn_steps
from agent.park_walk_planner import plan_park_walk
from agent.park_route_validation import RoutePlanningError, validate_park_route

logger = logging.getLogger(__name__)

# 후보 코스별 순환 방향(방위각). 서로 다른 방향의 도로망을 탐색해 대안을 확보한다.
VARIANT_BEARINGS: Dict[int, float] = {1: 30.0, 2: 150.0, 3: 270.0}
DETOUR_FACTOR = 1.35  # 원 둘레 대비 실제 보행망 거리의 초기 추정 비율
LOOP_WAYPOINT_COUNT = 6
DISTANCE_TOLERANCE = 0.10  # 이 오차 이내이면 보정 종료 (인수 조건 ±15% 에 여유 확보)
MAX_REFINEMENTS = 2
SCALE_LIMITS = (0.4, 2.5)
# [3번 서버] 공개 OSRM 이용 규칙(1초 1회) 준수: 후보 1개당 첫 라운드는 반경 1종만 질의한다(요청 1번 = 3회).
#   예전에는 반경 3종을 동시에 질의해(요청 1번 = 9회 동시) 운영에서 HTTP 429·연결 차단으로 직사각형 폴백이 났다.
#   호출 간격은 road_network_routes 가 서버 전체에서 1초 이상으로 맞춘다.
#   추가 보정은 남은 예산이 직전 라운드 소요 시간 이상일 때만 수행한다.
OSRM_TIMEOUT_S = 3.0
PLAN_TIME_BUDGET_S = 6.0
SPECULATIVE_SCALES: Tuple[float, ...] = (1.0,)
MAX_BACKTRACK_RATIO = 0.15
MAX_CLOSURE_GAP_M = 15.0
# 엄격 조건(거리 ±25%, 왕복 15%)을 맞추는 길이 없을 때만 쓰는 완화 기준. 직사각형(건물·철로 관통)보다는 실제 도로가 낫다.
#   운영 QA(10/22, 대전역·송강 20분): 두 곳은 900m 에 맞는 되돌아가지 않는 순환로가 도로망에 거의 없어 후보가 모두 네모가 됐다.
RELAXED_MAX_BACKTRACK = 0.30
RELAXED_MAX_ERROR = 0.50  # 20분 요청에 30분까지. 실측에서 1.77배(34분)는 시간이 너무 어긋났다.
RELAXED_MAX_TORTUOSITY = 1.8  # 길이 / 볼록껍질 둘레. 실제 순환 코스 62개는 1.02~1.69, 역 앞 광장을 헤매던 길은 1.97 이었다.
STATIC_MATCH_RADIUS_M = 300.0
FALLBACK_EDGE_SPACING_M = 25.0
M_PER_DEG_LAT = 111_320.0
# 처음 방향에서 탈락한 후보를 다른 방향으로 다시 시도한다 (현재 위치 모드, 시간 예산이 남을 때만, 방향당 OSRM 1회).
#   애경연구원 근처 실측: 서쪽(270도)은 하천·큰 도로에 막혀 반경을 바꿔도 길이가 2282→842→2282m 로 널뛰며 수렴하지 않았다.
#   반면 60·90·120·180·210도는 첫 시도부터 오차 16% 이내였다 -> 보정 반복보다 방향 교체가 효과적이다.
RETRY_BEARING_OFFSETS: Tuple[float, ...] = (-60.0, 60.0, -90.0)
RETRY_MIN_REMAINING_S = 2.0  # 재시도는 남은 예산이 이만큼 있을 때만 (OSRM 한 번이 보통 0.5~1.5초)

STATIC_SEOUL_LOOPS: Dict[int, List[List[float]]] = {
    1: V1_ROAD_ALIGNED_COORDS,
    2: V2_ROAD_ALIGNED_COORDS,
    3: V3_ROAD_ALIGNED_COORDS,
}
# 폴백 직사각형의 세로/가로 비율 (후보별로 모양을 달리한다)
FALLBACK_ASPECT_RATIOS: Dict[int, float] = {1: 0.6, 2: 1.0, 3: 1.6}


@dataclass(frozen=True)
class LoopPlan:
    """순환 코스 생성 결과. source 는 osrm_live / static_seoul / rectangle_fallback."""
    coords: List[List[float]]
    steps: List[Dict[str, Any]]
    distance_m: float
    source: str


def build_loop_waypoints(
    origin_lat: float,
    origin_lon: float,
    loop_length_m: float,
    bearing: float,
) -> List[Tuple[float, float]]:
    """출발지를 지나는 원형 순환 웨이포인트 (위도, 경도) 목록. 첫 점과 마지막 점은 출발지이다."""
    radius = loop_length_m / (2 * math.pi)
    center_lat, center_lon = destination_point(origin_lat, origin_lon, bearing, radius)
    origin_angle = (bearing + 180.0) % 360.0
    step_deg = 360.0 / LOOP_WAYPOINT_COUNT
    points = [(origin_lat, origin_lon)]
    for k in range(1, LOOP_WAYPOINT_COUNT):
        points.append(destination_point(center_lat, center_lon, (origin_angle + k * step_deg) % 360.0, radius))
    points.append((origin_lat, origin_lon))
    return points


def _route_waypoints(waypoints: List[Tuple[float, float]]) -> Optional[List[List[float]]]:
    """OSRM 보행 경로를 질의하고 왕복 구간을 정리한 좌표열을 반환한다."""
    result = fetch_osrm_foot_route(waypoints, timeout_seconds=OSRM_TIMEOUT_S)
    if not result:
        return None
    cleaned = collapse_backtracks(result[0])
    return cleaned if len(cleaned) >= 4 else None


def _is_valid_loop(coords: List[List[float]]) -> bool:
    """순환 종결성과 왕복 비율 기준을 충족하는지 검사한다."""
    return loop_closure_gap_m(coords) <= MAX_CLOSURE_GAP_M and backtrack_ratio(coords) <= MAX_BACKTRACK_RATIO


def _evaluate_scale(
    origin_lat: float,
    origin_lon: float,
    length_m: float,
    variant: int,
    target_distance_m: float,
    bearing_offset: float = 0.0,
) -> Optional[Tuple[List[List[float]], float, float]]:
    """단일 순환 반경에 대해 OSRM 경로를 평가하고 (좌표열, 실측거리, 오차율)을 반환."""
    bearing = (VARIANT_BEARINGS[variant] + bearing_offset) % 360.0
    waypoints = build_loop_waypoints(origin_lat, origin_lon, length_m, bearing)
    coords = _route_waypoints(waypoints)
    if coords is None:
        return None
    measured = polyline_length_m(coords)
    return coords, measured, abs(measured - target_distance_m) / target_distance_m


def _update_round_best(
    lengths: List[float],
    results: List[Optional[Tuple[List[List[float]], float, float]]],
    target_distance_m: float,
    best: Optional[Tuple[List[List[float]], float]],
) -> Tuple[Optional[Tuple[float, float]], Optional[Tuple[List[List[float]], float]]]:
    """한 라운드의 결과 목록에서 다음 보정 기준 anchor와 최적 유효 루프 best를 갱신."""
    anchor: Optional[Tuple[float, float]] = None
    for length_m, res in zip(lengths, results):
        if res is None:
            continue
        coords, measured, error = res
        if anchor is None or error < abs(anchor[1] - target_distance_m) / target_distance_m:
            anchor = (length_m, measured)
        if _is_valid_loop(coords) and (best is None or error < best[1]):
            best = (coords, error)
    return anchor, best


def route_tortuosity(coords: List[List[float]]) -> float:
    """길이 / 볼록껍질 둘레. 1에 가까우면 시원하게 한 바퀴, 크면 좁은 곳을 빙빙 도는 길이다."""
    kx = M_PER_DEG_LAT * math.cos(math.radians(coords[0][1]))
    hull = MultiPoint([(lon * kx, lat * M_PER_DEG_LAT) for lon, lat in coords]).convex_hull
    perimeter = hull.length if hull.geom_type == "Polygon" else 2.0 * hull.length
    return polyline_length_m(coords) / perimeter if perimeter > 0 else float("inf")


def _collect_relaxed(sink: Optional[List[Tuple[float, List[List[float]]]]], coords: List[List[float]], error: float) -> None:
    """엄격 조건에는 못 미치지만 실제 도로 순환으로 쓸 만한 결과를 (나쁜 정도, 좌표) 로 모아 둔다."""
    if sink is None or loop_closure_gap_m(coords) > MAX_CLOSURE_GAP_M:
        return
    retrace = backtrack_ratio(coords)
    if retrace > RELAXED_MAX_BACKTRACK or error > RELAXED_MAX_ERROR or route_tortuosity(coords) > RELAXED_MAX_TORTUOSITY:
        return
    sink.append((error + 2.0 * max(0.0, retrace - MAX_BACKTRACK_RATIO), coords))


def _query_scale_lengths(
    origin_lat: float,
    origin_lon: float,
    lengths: List[float],
    variant: int,
    target_distance_m: float,
    bearing_offset: float,
) -> List[Any]:
    """주어진 스케일별 목표 루프 길이에 대해 OSRM 후보 경로들을 단일 또는 병렬 평가."""
    if len(lengths) == 1:
        return [_evaluate_scale(origin_lat, origin_lon, lengths[0], variant, target_distance_m, bearing_offset)]
    with ThreadPoolExecutor(max_workers=len(lengths)) as pool:
        futures = [
            pool.submit(_evaluate_scale, origin_lat, origin_lon, lm, variant, target_distance_m, bearing_offset)
            for lm in lengths
        ]
        return [f.result() for f in futures]


def _plan_live(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    variant: int,
    deadline: float,
    bearing_offset: float = 0.0,
    max_refinements: int = MAX_REFINEMENTS,
    relaxed_sink: Optional[List[Tuple[float, List[List[float]]]]] = None,
) -> Optional[LoopPlan]:
    """OSRM 실시간 경로를 질의하고 목표 거리에 수렴하도록 반경을 보정한다.

    bearing_offset 은 재시도 때 방향을 돌리고, max_refinements=0 이면 반경 보정 없이 한 번만 질의한다.
    relaxed_sink 를 주면 엄격 조건에는 못 미쳐도 쓸 만한 실제 도로 순환을 모아 둔다 (호출자가 마지막에 고른다).
    """
    loop_length = target_distance_m / DETOUR_FACTOR
    best: Optional[Tuple[List[List[float]], float]] = None
    scales: Tuple[float, ...] = SPECULATIVE_SCALES

    for _ in range(max_refinements + 1):
        round_started = time.monotonic()
        lengths = [loop_length * sc for sc in scales]
        results = _query_scale_lengths(origin_lat, origin_lon, lengths, variant, target_distance_m, bearing_offset)
        round_elapsed = time.monotonic() - round_started
        for res in results:
            if res is not None:
                _collect_relaxed(relaxed_sink, res[0], res[2])
        anchor, best = _update_round_best(lengths, results, target_distance_m, best)

        if anchor is None or best is None:
            break
        if best[1] <= DISTANCE_TOLERANCE or time.monotonic() + round_elapsed > deadline:
            break

        ratio = target_distance_m / anchor[1]
        loop_length = anchor[0] * min(max(ratio, SCALE_LIMITS[0]), SCALE_LIMITS[1])
        scales = (1.0,)

    # 실시간 OSRM 보행로가 유효 루프(건물/수면 관통 없음, 루프 종결성 충족)인 경우,
    # 허공의 직사각형 폴백으로 추락하는 것을 방지하기 위해 최대 25% 오차까지는 실시간 보행로를 채택
    if best is None or best[1] > DISTANCE_TOLERANCE + 0.15:
        return None
    return _to_plan(best[0], "osrm_live")


def _to_plan(coords: List[List[float]], source: str) -> LoopPlan:
    return LoopPlan(
        coords=coords,
        steps=build_turn_steps(coords),
        distance_m=round(polyline_length_m(coords), 1),
        source=source,
    )


def _plan_static_pilot_park(
    origin_lat: float,
    origin_lon: float,
    variant: int,
    pilot_park_id: Optional[str] = None,
    target_distance_m: Optional[float] = None,
) -> Optional[LoopPlan]:
    """Compatibility entry point: only verified, boundary-constrained graph routes."""
    park_key = resolve_pilot_park_key(origin_lat, origin_lon, pilot_park_id=pilot_park_id)
    if park_key is None:
        raise RoutePlanningError("BOUNDARY_DATA_UNAVAILABLE", "선택한 공원의 신뢰할 수 있는 경계 데이터가 없습니다.")
    target = target_distance_m or 1400.0
    coords = plan_park_walk(park_key, origin_lat, origin_lon, target, variant)
    validate_park_route(coords, park_key, 3.0, target / 50.0, (origin_lon, origin_lat))
    return _to_plan(coords, f"park_graph_{park_key}")


def _plan_static_seoul(
    origin_lat: float,
    origin_lon: float,
    variant: int,
    target_distance_m: Optional[float] = None,
) -> Optional[LoopPlan]:
    """출발지가 서울광장 인근일 때만 사용하는 오프라인 정적 도로망 코스.

    목표 거리가 주어진 경우 실측 거리가 목표 거리의 허용 오차(15%) 이내일 때만 채택한다.
    """
    static = STATIC_SEOUL_LOOPS.get(variant)
    if not static:
        return None
    if haversine_m((origin_lon, origin_lat), static[0]) > STATIC_MATCH_RADIUS_M:
        return None
    coords = collapse_backtracks(static)
    if not _is_valid_loop(coords):
        return None
    if target_distance_m is not None and target_distance_m > 0:
        length = polyline_length_m(coords)
        if abs(length - target_distance_m) / target_distance_m > DISTANCE_TOLERANCE + 0.05:
            return None
    return _to_plan(coords, "static_seoul")


def _densify_edge(start: Tuple[float, float], end: Tuple[float, float]) -> List[List[float]]:
    """[경도, 위도] 두 점 사이를 약 25m 간격으로 보간한다(끝점 제외)."""
    count = max(1, math.ceil(haversine_m(start, end) / FALLBACK_EDGE_SPACING_M))
    return [
        [start[0] + (end[0] - start[0]) * i / count, start[1] + (end[1] - start[1]) * i / count]
        for i in range(count)
    ]


def _plan_rectangle_fallback(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    variant: int,
) -> LoopPlan:
    """목표 거리에 맞춘 직사각형 순환 코스. 도로망 정보가 없으므로 건물을 관통할 수 있다."""
    aspect = FALLBACK_ASPECT_RATIOS[variant]
    width_m = target_distance_m / (2 * (1 + aspect))
    d_lat = (width_m * aspect) / M_PER_DEG_LAT
    d_lon = width_m / (M_PER_DEG_LAT * math.cos(math.radians(origin_lat)))
    corners = [
        (origin_lon, origin_lat),
        (origin_lon, origin_lat + d_lat),
        (origin_lon + d_lon, origin_lat + d_lat),
        (origin_lon + d_lon, origin_lat),
    ]
    coords: List[List[float]] = []
    for i, corner in enumerate(corners):
        coords.extend(_densify_edge(corner, corners[(i + 1) % len(corners)]))
    coords.append(list(corners[0]))
    return _to_plan(coords, "rectangle_fallback")


def _plan_offline_network(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    variant: int,
) -> Optional[LoopPlan]:
    """오프라인 실제 보행 도로망 그래프에서 건물 관통 없는 순환 코스 생성."""
    res = plan_offline_network_loop(origin_lat, origin_lon, target_distance_m, variant)
    if res is None:
        return None
    coords, _, _ = res
    if not _is_valid_loop(coords):
        return None
    # The offline graph has discrete loop lengths. Keep its walkable route even
    # when it misses the target; the caller reports the actual measured distance.
    return _to_plan(coords, "offline_network")


def _plan_variant(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    variant: int,
    deadline: float,
    origin_mode: str = "current_location",
    pilot_park_id: Optional[str] = None,
) -> Optional[LoopPlan]:
    """공원/P&R은 내부 보행 그래프만 사용하며 일반 라우터나 기하학적 폴백을 사용하지 않는다.

    현재 위치 모드에서 실제 길 기반 코스를 못 만들면 None 을 돌려준다 (직사각형은 호출자가 마지막 수단으로만 쓴다).
    """
    if origin_mode in ("park", "parking_pnr"):
        return _plan_static_pilot_park(
            origin_lat, origin_lon, variant, pilot_park_id=pilot_park_id, target_distance_m=target_distance_m
        )

    # 📍 현위치 기반 모드 (current_location)
    relaxed: List[Tuple[float, List[List[float]]]] = []
    plan = _plan_live(origin_lat, origin_lon, target_distance_m, variant, deadline, relaxed_sink=relaxed)
    if plan is not None:
        return plan
    logger.warning("OSRM 순환 코스 생성 실패(variant=%d): 오프라인 도로망 폴백을 사용합니다.", variant)

    offline_target = target_distance_m * {1: 1.0, 2: 1.2, 3: 1.1}[variant]
    plan = _plan_static_seoul(origin_lat, origin_lon, variant, target_distance_m=offline_target)
    if plan is not None:
        return plan
    plan = _plan_offline_network(origin_lat, origin_lon, offline_target, variant)
    if plan is not None:
        return plan
    # 조건에서 탈락한 후보는 방향을 바꿔 다시 시도한다 (방향당 OSRM 1회, 시간 예산이 남을 때만).
    for offset in RETRY_BEARING_OFFSETS:
        if deadline - time.monotonic() < RETRY_MIN_REMAINING_S:
            break
        plan = _plan_live(
            origin_lat, origin_lon, target_distance_m, variant, deadline, offset, max_refinements=0, relaxed_sink=relaxed
        )
        if plan is not None:
            return plan
    if relaxed:
        # 엄격 조건을 맞춘 길이 끝내 없으면, 지금까지 계산해 본 것 중 덜 나쁜 실제 도로 순환을 쓴다 (직사각형보다 낫다).
        _, coords = min(relaxed, key=lambda item: item[0])
        logger.info("엄격 조건을 맞춘 순환이 없어 완화 기준의 실제 도로 순환을 사용합니다(variant=%d).", variant)
        return _to_plan(coords, "osrm_live")
    return None


def _rectangle_candidates(origin_lat: float, origin_lon: float, target_distance_m: float) -> Dict[int, LoopPlan]:
    """실제 길 기반 후보가 하나도 없을 때만 쓰는 마지막 수단. 건물을 관통할 수 있다."""
    return {
        variant: _plan_rectangle_fallback(origin_lat, origin_lon, target_distance_m * factor, variant)
        for variant, factor in {1: 1.0, 2: 1.2, 3: 1.1}.items()
    }


def _substitute_seoul_duplicates(
    plans: Dict[int, LoopPlan], origin_lat: float, origin_lon: float, origin_mode: str
) -> None:
    """서울시청 권역의 중복 순환 후보를 정적 검증 경로로 대체."""
    if origin_mode in ("park", "parking_pnr"):
        return
    seen_routes = {
        tuple((round(lon, 6), round(lat, 6)) for lon, lat in plan.coords)
        for plan in plans.values()
    }
    for variant, plan in list(plans.items()):
        signature = tuple((round(lon, 6), round(lat, 6)) for lon, lat in plan.coords)
        count = sum(
            tuple((round(lon, 6), round(lat, 6)) for lon, lat in existing.coords) == signature
            for existing in plans.values()
        )
        if count <= 1:
            continue
        alternate = _plan_static_seoul(origin_lat, origin_lon, 1)
        if alternate is None:
            continue
        alt_sig = tuple((round(lon, 6), round(lat, 6)) for lon, lat in alternate.coords)
        if alt_sig not in seen_routes:
            plans[variant] = alternate
            seen_routes.add(alt_sig)


def _deduplicate_osrm_live(plans: Dict[int, LoopPlan], origin_mode: str) -> Dict[int, LoopPlan]:
    """도로가 성긴 곳에서 OSRM 이 동일한 경로를 준 경우 후보 번호가 작은 쪽만 유지."""
    if origin_mode in ("park", "parking_pnr"):
        return plans
    unique: Dict[Tuple, int] = {}
    for variant in sorted(plans):
        if plans[variant].source != "osrm_live":
            continue
        unique.setdefault(tuple((round(lon, 6), round(lat, 6)) for lon, lat in plans[variant].coords), variant)
    keep = set(unique.values())
    return {v: p for v, p in plans.items() if p.source != "osrm_live" or v in keep}


def plan_loop_candidates(
    origin_lat: float,
    origin_lon: float,
    target_distance_m: float,
    time_budget_s: float = PLAN_TIME_BUDGET_S,
    origin_mode: str = "current_location",
    pilot_park_id: Optional[str] = None,
) -> Dict[int, LoopPlan]:
    """방향이 다른 순환 후보 3종을 병렬로 생성한다. 키는 후보 번호(1~3)."""
    deadline = time.monotonic() + time_budget_s
    with ThreadPoolExecutor(max_workers=len(VARIANT_BEARINGS)) as pool:
        futures = {
            variant: pool.submit(
                _plan_variant,
                origin_lat,
                origin_lon,
                target_distance_m,
                variant,
                deadline,
                origin_mode,
                pilot_park_id,
            )
            for variant in VARIANT_BEARINGS
        }
        results = {variant: future.result() for variant, future in futures.items()}

    plans = {variant: plan for variant, plan in results.items() if plan is not None}
    if not plans:
        return _rectangle_candidates(origin_lat, origin_lon, target_distance_m)

    _substitute_seoul_duplicates(plans, origin_lat, origin_lon, origin_mode)
    return _deduplicate_osrm_live(plans, origin_mode)
