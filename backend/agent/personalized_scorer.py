"""[US-B3 제안] 실측 지표 + 반려견 조건 + 선호로 매기는 맞춤 점수 (100점).

기존 score_candidate_route(계단 30 / 경사 30 / 지면온도 20 / 거리 20)는 후보 번호별 고정 프로필을 쓰고,
반려견 관절 단계와 그늘·노면 선호를 반영하지 않아 조건을 바꿔도 순위가 같았다.
이 점수는 services/route_profile.measure_route_profile 의 실측값을 쓰고 다음을 반영한다.

| 항목 | 배점 | 반영 |
|---|---|---|
| 계단 | 25 | 계단 회피 요청 시 계단이 있으면 0. 정보가 없으면 중간(15) |
| 경사 | 25 | 관절 단계별 경사 상한(JOINT_SLOPE_LIMIT) 이하 만점, 1.5배 이하 12, 그 이상 0 |
| 지면온도 | 20 | 실측 그늘 비율로 식힌 지면온도. 안전 기준(SAFE_MAX_C 33℃, #153) 이하 20, 주의 앞쪽 절반 12, 주의 6, 위험 0 |
| 선호 적합도 | 15 | 그늘 비율·폭신 노면 비율을 선호에 따라 가중 평균. 모르는 값은 0.5 |
| 거리 | 15 | 목표 거리 대비 오차 |

자료가 없는 값은 지어내지 않고 중간값으로 둔다. 가중치는 현정님 검토 후 확정한다(제안 단계).
"""

from dataclasses import dataclass
from typing import Any, Dict, Optional

from services.weather_context import CAUTION_MAX_C, SAFE_MAX_C

# 관절 케어 단계별 경사 상한(%). 기존 채점 5%·8%와 계획서 8%·15% 차이(#147 논의와 별개)를 단계별로 나눔
JOINT_SLOPE_LIMIT = {0: 8.0, 1: 6.0, 2: 5.0, 3: 4.0, 4: 4.0}
SHADE_COOLING = 0.75  # 그늘 비율 1.0 일 때 지면-기온 차이를 75% 줄인다 (기존 _variant_profile 과 같은 계수)
UNKNOWN = 0.5


@dataclass
class PersonalizedScore:
    total: float
    stairs: float
    slope: float
    thermal: float
    preference: float
    distance: float
    slope_limit: float
    surface_temp_c: Optional[float]


def slope_limit_for(joint_care_level: int, calibrated_max_slope: Optional[float] = None) -> float:
    """관절 단계 상한과 (피드백으로 보정된) 에이전트 경사 상한 중 더 엄격한 값."""
    limit = JOINT_SLOPE_LIMIT.get(int(joint_care_level), 6.0)
    return min(limit, calibrated_max_slope) if calibrated_max_slope else limit


def cooled_surface_temp(air_c: Optional[float], surface_c: Optional[float], shade_ratio: Optional[float]) -> Optional[float]:
    if surface_c is None:
        return None
    if air_c is None or shade_ratio is None:
        return surface_c
    return round(air_c + (surface_c - air_c) * (1.0 - SHADE_COOLING * shade_ratio), 1)


def preference_weights(shade_priority: bool, preferred_surfaces) -> Dict[str, float]:
    explicit_soft = any(s in ("dirt", "grass", "rubber") for s in (preferred_surfaces or []))
    if shade_priority and not explicit_soft:
        return {"shade": 0.7, "soft": 0.3}
    if explicit_soft and not shade_priority:
        return {"shade": 0.3, "soft": 0.7}
    return {"shade": 0.5, "soft": 0.5}


def score_personalized(profile: Dict[str, Any], *, distance_m: float, target_distance_m: float,
                       joint_care_level: int = 1, calibrated_max_slope: Optional[float] = None,
                       avoid_stairs: bool = True, shade_priority: bool = False, preferred_surfaces=None,
                       air_temp_c: Optional[float] = None, surface_temp_c: Optional[float] = None) -> PersonalizedScore:
    # 1. 계단 (25)
    stairs_count = profile.get("stairs_count")
    if stairs_count is None:
        stairs = 15.0
    elif stairs_count == 0:
        stairs = 25.0
    else:
        stairs = 0.0 if avoid_stairs else 15.0

    # 2. 경사 (25): 관절 단계 상한
    limit = slope_limit_for(joint_care_level, calibrated_max_slope)
    max_slope = profile.get("max_slope_percent") or 0.0
    slope = 25.0 if max_slope <= limit else 12.0 if max_slope <= limit * 1.5 else 0.0

    # 3. 지면온도 (20): 실측 그늘로 식힌 온도
    shade = profile.get("shade_ratio")
    temp = cooled_surface_temp(air_temp_c, surface_temp_c, shade)
    if temp is None:
        thermal = 10.0
    elif temp <= SAFE_MAX_C:
        thermal = 20.0
    elif temp <= (SAFE_MAX_C + CAUTION_MAX_C) / 2:
        thermal = 12.0
    elif temp <= CAUTION_MAX_C:
        thermal = 6.0
    else:
        thermal = 0.0

    # 4. 선호 적합도 (15)
    weights = preference_weights(shade_priority, preferred_surfaces)
    soft = profile.get("soft_surface_ratio") if (profile.get("surface_known_ratio") or 0) >= 0.5 else None
    fit = (weights["shade"] * (shade if shade is not None else UNKNOWN)
           + weights["soft"] * (soft if soft is not None else UNKNOWN))
    preference = round(15.0 * fit, 1)

    # 5. 거리 (15)
    error = abs(distance_m - target_distance_m) / target_distance_m if target_distance_m > 0 else 0.0
    distance = max(0.0, round(15.0 * (1.0 - min(1.0, error * 4)), 1))

    total = round(stairs + slope + thermal + preference + distance, 1)
    return PersonalizedScore(total, stairs, slope, thermal, preference, distance, limit, temp)
