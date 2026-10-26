"""[3번 노희선 - 서버] 짧은 목표(20분 등)에서 엄격한 조건을 못 맞춰도, 실제 도로 결과가 있으면 네모 대신 그것을 쓴다.

운영 QA(2026-10-22, 지도로 확인): 대전역·송강 20분(목표 900m)에서 후보 3개가 모두 직사각형이 되어
철로·승강장·학교 운동장·아파트를 가로질렀다. 로컬 실측으로 두 곳은 900m 에 맞는 '되돌아가지 않는 순환로'가
도로망에 거의 없었다(대전역 최소 유효 순환 1,146m, 송강 1,310m). 되돌아감 25~30% 인 900m 길은 있었다.

규칙
- 엄격 조건(거리 ±25%, 왕복 15%)을 맞추는 길이 있으면 그것을 쓴다 (예전과 같음).
- 없으면 이미 계산해 본 결과 중 '덜 나쁜' 실제 도로 순환(왕복 30% 이하, 거리 오차 50% 이하, 빙빙 돌지 않는 길)을 쓴다. 외부 호출은 늘지 않는다.
- 그것마저 없을 때만 직사각형 (마지막 수단, 예전과 같음).
- 후보끼리 같은 길이면 하나만 남긴다.
"""

import agent.loop_route_planner as lrp

ORIGIN = (36.3320, 127.4342)  # 대전역
M_LAT = 111_320.0


def _p(east_m, north_m):
    return [ORIGIN[1] + east_m / (M_LAT * 0.805), ORIGIN[0] + north_m / M_LAT]


def _loop(side_m, stem_m=0.0):
    """출발점에서 stem_m 만큼 나가 한 변이 side_m 인 정사각형을 돌고 같은 길로 돌아오는 코스 (stem 0 이면 순수 순환)."""
    s = side_m
    base = [_p(0, 0)]
    if stem_m:
        base.append(_p(0, stem_m))
        origin_y = stem_m
    else:
        origin_y = 0
    ring = [_p(0, origin_y), _p(s, origin_y), _p(s, origin_y + s), _p(0, origin_y + s), _p(0, origin_y)]
    coords = base[:1] + ([base[1]] if stem_m else []) + ring[1:]
    if stem_m:
        coords.append(_p(0, 0))
    return coords


def _result(coords, target):
    length = lrp.polyline_length_m(coords)
    return coords, length, abs(length - target) / target


def _install(monkeypatch, by_offset):
    """_evaluate_scale 을 가짜로: 방향 보정값별로 정해 둔 코스를 돌려준다 (없으면 None)."""
    monkeypatch.setattr(lrp, "_plan_static_seoul", lambda *a, **k: None)
    monkeypatch.setattr(lrp, "_plan_offline_network", lambda *a, **k: None)

    def fake(lat, lon, length_m, variant, target, bearing_offset=0.0):
        coords = by_offset(variant, bearing_offset)
        return None if coords is None else _result(coords, target)

    monkeypatch.setattr(lrp, "_evaluate_scale", fake)


def test_valid_loop_too_long_is_used_instead_of_rectangle(monkeypatch):
    """목표 900m 인데 실제 도로 순환이 1,200m 뿐이면(오차 33%) 그 순환을 쓴다. 후보가 모두 같은 길이면 하나만 남는다."""
    loop = _loop(300.0)
    assert 1100 < lrp.polyline_length_m(loop) < 1300
    _install(monkeypatch, lambda v, off: loop)
    plans = lrp.plan_loop_candidates(*ORIGIN, 900.0)
    assert plans and all(p.source == "osrm_live" for p in plans.values())
    assert len(plans) == 1


def test_loop_with_some_retrace_is_used_when_length_fits(monkeypatch):
    """거리는 맞지만 왕복이 25% 인 실제 길은, 직사각형보다 낫다."""
    route = _loop(100.0, stem_m=100.0)  # 되돌아가는 줄기 100m x2 + 순환 400m
    assert 0.15 < lrp.backtrack_ratio(route) <= 0.30
    target = lrp.polyline_length_m(route)
    _install(monkeypatch, lambda v, off: route)
    plans = lrp.plan_loop_candidates(*ORIGIN, target)
    assert plans and all(p.source == "osrm_live" for p in plans.values())


def test_strict_result_from_retry_beats_relaxed_first_try(monkeypatch):
    """처음 방향은 왕복이 많아 탈락 후보지만, 다른 방향이 엄격 조건을 맞추면 그쪽을 쓴다."""
    relaxed = _loop(100.0, stem_m=100.0)
    target = lrp.polyline_length_m(relaxed)
    strict = _loop(target / 4.0)
    assert lrp.backtrack_ratio(strict) == 0.0

    def by_offset(variant, off):
        return relaxed if off == 0.0 else (strict if variant == 1 else None)

    _install(monkeypatch, by_offset)
    plan = lrp._plan_variant(*ORIGIN, target, 1, lrp.time.monotonic() + 60)
    assert plan is not None and lrp.backtrack_ratio(plan.coords) == 0.0


def test_half_retraced_route_is_still_rejected(monkeypatch):
    """왕복 50% 는 너무 심하다 -> 예전처럼 직사각형 (마지막 수단)."""
    route = _loop(50.0, stem_m=200.0)
    assert lrp.backtrack_ratio(route) > 0.30
    _install(monkeypatch, lambda v, off: route)
    plans = lrp.plan_loop_candidates(*ORIGIN, lrp.polyline_length_m(route))
    assert all(p.source == "rectangle_fallback" for p in plans.values())


def test_far_too_long_loop_is_still_rejected(monkeypatch):
    """목표의 3배가 넘는 순환은 시간이 너무 어긋난다 -> 직사각형 (마지막 수단)."""
    loop = _loop(700.0)  # 약 2,800m, 목표 900m
    _install(monkeypatch, lambda v, off: loop)
    plans = lrp.plan_loop_candidates(*ORIGIN, 900.0)
    assert all(p.source == "rectangle_fallback" for p in plans.values())


def test_open_route_is_never_used(monkeypatch):
    """출발점으로 돌아오지 않는 길은 완화 기준에서도 쓰지 않는다."""
    line = [_p(0, 0), _p(100, 0), _p(200, 0), _p(300, 0)]
    _install(monkeypatch, lambda v, off: line)
    plans = lrp.plan_loop_candidates(*ORIGIN, 600.0)
    assert all(p.source == "rectangle_fallback" for p in plans.values())


def _sawtooth(teeth=20, dx=10.0, height=100.0):
    """좁은 범위를 톱니처럼 오르내리며 길이만 늘리는 길 (되돌아간 구간은 없지만 한 곳을 빙빙 돈다)."""
    coords = [_p(0, 0)]
    for i in range(1, teeth + 1):
        coords.append(_p(i * dx, height if i % 2 else 0.0))
    coords.append(_p(0, 0))
    return coords


def test_zigzag_route_is_not_used_even_in_relaxed_mode(monkeypatch):
    """거리는 맞아도 좁은 곳을 빙빙 도는 길(길이 / 볼록껍질 둘레가 너무 큼)은 산책길로 쓰지 않는다."""
    route = _sawtooth()
    assert lrp.backtrack_ratio(route) <= 0.15
    assert lrp.route_tortuosity(route) > lrp.RELAXED_MAX_TORTUOSITY
    target = lrp.polyline_length_m(route) / 1.3  # 순환 조건은 맞지만 거리가 30% 길어 엄격 조건 밖
    _install(monkeypatch, lambda v, off: route)
    plans = lrp.plan_loop_candidates(*ORIGIN, target)
    assert all(p.source == "rectangle_fallback" for p in plans.values())


def test_ordinary_block_loop_has_low_tortuosity():
    assert 0.95 <= lrp.route_tortuosity(_loop(300.0)) < 1.2


def test_loop_too_long_by_more_than_half_is_rejected(monkeypatch):
    """20분 요청에 34분짜리(목표의 1.77배)는 시간이 너무 어긋난다 -> 오차 50% 초과는 쓰지 않는다."""
    loop = _loop(300.0)  # 약 1,200m
    _install(monkeypatch, lambda v, off: loop)
    plans = lrp.plan_loop_candidates(*ORIGIN, lrp.polyline_length_m(loop) / 1.77)
    assert all(p.source == "rectangle_fallback" for p in plans.values())
