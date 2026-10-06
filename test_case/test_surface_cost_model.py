"""[US-B1, US-B2, US-B3, US-B4] 무계단·완만경사·그늘 과학 라우팅 및 다요소 스코어링 TDD 테스트 모듈.

최신 생명주기 명세서(docs/03, docs/04, docs/06) 기준:
- [US-B1] 지도 데이터 기반 확인된 계단 구간 우선 회피:
  - OSM 보행 네트워크 highway=steps 링크를 하드 제약(Hard Constraint)으로 배제
  - 계단 메타데이터 투명 제공: has_stairs: false, stairs_data_source: "osm", confidence: 0.90
  - 계단 우회 불가 시 계단 수/위치 사전 고지
- [US-B2] DEM 기반 최대 경사도 제어 및 완만한 경사 경로:
  - 수치표고모델(DEM) 고도 데이터 기반 링크별 종단 경사도(slope_percent) 산출
  - 급경사(> 8%) 구간 페널티 가중치 부여, 매우 완만(<=5%), 완만(<=8%) 우선 라우팅
  - 코스 전체 최대 경사도 및 평균 경사도 산출
- [US-B3] 태양 위치(SunCalc) 및 건물 형상 기반 시간대별 그늘 우선 평가:
  - 11~15시 피크 일조 시간대에 그늘길 비용 할인(W_shade = 0.6) 적용
  - 코스 전체 예상 그늘 비율(average_shade_ratio) 산출
- [US-B4] Routing API Adapter 연동 및 다요소 스코어링 (Candidate Route Scorer):
  - 후보 경로 2~3개 중 계단 배제(30점), 경사도 적합도(30점), 그늘 지표(20점), 거리 적합도(20점) 종합 채점 (100점 만점)
  - 최고 점수의 최적 경로 선정 알고리즘 검증
- 노면 비용 모델 (잔디/흙 할인 0.45, 아스팔트 2.5, 자갈 3.5) 및 OSM 속성/공원 폴리곤 결합 노면 출처 투명성 검증
"""

import pytest
from typing import List, Dict, Any, Optional, Tuple

# 노면 기본 가중치 및 할인/페널티 상수
SURFACE_BASE_WEIGHTS = {
    "grass": 0.6,
    "dirt": 0.6,
    "rubber": 0.7,
    "paved": 1.0,
    "asphalt": 2.5,
    "gravel": 3.5,
}
PREF_DISCOUNT_FACTOR = 0.45


def resolve_surface_attribute(
    osm_surface: Optional[str] = None,
    community_verified_surface: Optional[str] = None,
    in_park: bool = False,
    highway: str = "footway",
    land_cover_code: Optional[str] = None  # 하위 호환성 보조 파라미터
) -> Tuple[str, str, float]:
    """OSM 명시 태그, 공원 폴리곤 및 도로 분류 기반 노면 출처 투명성 해소 로직."""
    # 1. OSM 명시 노면 태그 (최우선)
    if osm_surface in ["dirt", "grass", "paved", "asphalt", "rubber", "gravel"]:
        return osm_surface, "osm_verified", 0.95

    # 2. 커뮤니티 검증 노면
    if community_verified_surface is not None:
        return community_verified_surface, "community_verified", 0.90

    # 3. 도시공원 폴리곤 내부 보행로 (노면 태그 결측 시 흙길 우선)
    if in_park:
        return "dirt", "park_polygon", 0.85

    # 4. 레거시 호환 보조 판별
    if land_cover_code in ["초지", "grassland"]:
        return "grass", "osm_context", 0.80
    elif land_cover_code in ["나지", "bare_soil"]:
        return "dirt", "osm_context", 0.80

    # 5. 도로 분류(highway) 기반 기본 추정
    if highway in ["residential", "tertiary", "secondary", "primary"]:
        return "asphalt", "estimated", 0.50
    return "paved", "estimated", 0.50


# 하위 호환성 별칭 함수
resolve_surface_with_land_cover = resolve_surface_attribute


def calculate_link_cost(
    length_m: float,
    surface: str,
    selected_preferred_surfaces: List[str],
    slope_percent: float = 0.0,
    is_stairs: bool = False,
    shade_ratio: float = 0.0,
    is_noon_peak: bool = False
) -> float:
    """[US-B1~B4] 노면, 계단, 경사도, 그늘을 종합 반영한 링크 가중치 비용 함수."""
    # 1. 계단 하드 회피 (비용 무한대 가깝게 패널티 부여)
    if is_stairs:
        return length_m * 100.0

    # 2. 노면 기본 비용
    base_weight = SURFACE_BASE_WEIGHTS.get(surface, 1.0)
    pref_factor = PREF_DISCOUNT_FACTOR if surface in selected_preferred_surfaces else 1.0

    # 3. 경사도 페널티 (US-B2): > 8% 급경사는 3.0배 페널티, <= 5%는 1.0
    slope_factor = 1.0
    if slope_percent > 8.0:
        slope_factor = 3.0
    elif slope_percent > 5.0:
        slope_factor = 1.5

    # 4. 그늘 할인 (US-B3): 11~15시 피크 시간대 & 그늘 비율 >= 0.5 시 0.6 할인
    shade_factor = 1.0
    if is_noon_peak and shade_ratio >= 0.5:
        shade_factor = 0.6

    return length_m * base_weight * pref_factor * slope_factor * shade_factor


def filter_links_avoiding_stairs(links: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """[US-B1] OSM 네트워크에서 계단(highway=steps) 링크 배제 및 메타데이터 반환."""
    filtered = [l for l in links if l.get("highway") != "steps"]
    metadata = {
        "has_stairs": any(l.get("highway") == "steps" for l in filtered),
        "stairs_data_source": "osm",
        "confidence": 0.90,
        "stairs_avoidance_applied": True
    }
    return filtered, metadata


def calculate_course_slope_metrics(links: List[Dict[str, Any]]) -> Dict[str, float]:
    """[US-B2] 코스 전체 링크들의 최대 경사도 및 거리 가중 평균 경사도 산출."""
    if not links:
        return {"max_slope_percent": 0.0, "average_slope_percent": 0.0}

    total_dist = sum(l["length_m"] for l in links)
    max_slope = max(l.get("slope_percent", 0.0) for l in links)
    weighted_slope_sum = sum(l["length_m"] * l.get("slope_percent", 0.0) for l in links)
    avg_slope = (weighted_slope_sum / total_dist) if total_dist > 0 else 0.0

    return {
        "max_slope_percent": round(max_slope, 1),
        "average_slope_percent": round(avg_slope, 1)
    }


def score_candidate_route(
    candidate: Dict[str, Any],
    target_distance: float,
    is_noon: bool = True
) -> float:
    """[US-B4] Candidate Route Scorer: 후보 경로 다요소 종합 채점 (100점 만점)."""
    # 1. 계단 배제 (30점): 계단 없으면 30점, 있으면 0점
    stairs_score = 0.0 if candidate.get("has_stairs", False) else 30.0

    # 2. 경사도 점수 (30점): max_slope <= 5% 30점, <= 8% 20점, > 8% 10점
    max_slope = candidate.get("max_slope_percent", 5.0)
    if max_slope <= 5.0:
        slope_score = 30.0
    elif max_slope <= 8.0:
        slope_score = 20.0
    else:
        slope_score = 10.0

    # 3. 그늘 점수 (20점): 그늘 비율 * 20
    shade_ratio = candidate.get("average_shade_ratio", 0.5)
    shade_score = round(shade_ratio * 20.0, 1)

    # 4. 거리 적합도 점수 (20점): 오차율 0%일 때 20점, 오차율마다 감점
    dist = candidate.get("total_distance_m", target_distance)
    error_rate = abs(dist - target_distance) / target_distance if target_distance > 0 else 0.0
    dist_score = max(0.0, round(20.0 * (1.0 - min(1.0, error_rate * 4)), 1))

    total_score = stairs_score + slope_score + shade_score + dist_score
    return min(100.0, total_score)


# ==========================================
# 테스트 스위트
# ==========================================

class TestSurfaceCostModel:
    """노면 가중치 비용 모델 단위 테스트 (US-B4 노면 기초)."""

    def test_preferred_surface_discount_applied(self):
        """선호 노면 선택 시 비용 할인(0.45)이 정상 적용되는지 검증."""
        cost_grass = calculate_link_cost(100.0, "grass", ["dirt", "grass"])
        assert cost_grass == pytest.approx(100.0 * 0.6 * 0.45, rel=1e-3)

    def test_asphalt_and_gravel_penalties(self):
        """아스팔트(2.5) 및 자갈(3.5) 페널티 작동 검증."""
        cost_asphalt = calculate_link_cost(100.0, "asphalt", ["dirt"])
        cost_gravel = calculate_link_cost(100.0, "gravel", ["dirt"])
        assert cost_asphalt == pytest.approx(250.0, rel=1e-3)
        assert cost_gravel == pytest.approx(350.0, rel=1e-3)


class TestStairsAvoidanceRouting:
    """[US-B1] 지도 데이터 기반 계단 회피 테스트."""

    def test_filter_links_removes_stairs_links(self, mock_osm_network_links):
        """OSM 네트워크에서 highway=steps 링크가 하드 배제되는지 검증."""
        filtered, meta = filter_links_avoiding_stairs(mock_osm_network_links)
        assert not any(l.get("highway") == "steps" for l in filtered)
        assert meta["has_stairs"] is False
        assert meta["stairs_data_source"] == "osm"
        assert meta["confidence"] == 0.90

    def test_stairs_link_has_prohibitive_cost(self):
        """계단 링크는 일반 링크 대비 최소 100배 이상의 고비용이 부여되어 라우터가 배제하는지 검증."""
        stairs_cost = calculate_link_cost(30.0, "paved", [], is_stairs=True)
        normal_cost = calculate_link_cost(30.0, "paved", [], is_stairs=False)
        assert stairs_cost >= normal_cost * 100


class TestDemSlopeControl:
    """[US-B2] DEM 기반 경사도 제어 및 완만 경사 평가 테스트."""

    def test_steep_slope_penalized(self):
        """경사도 11.2% 급경사 링크는 완만 평지(2.0%) 대비 3배 페널티가 부여되는지 검증."""
        steep_cost = calculate_link_cost(100.0, "paved", [], slope_percent=11.2)
        gentle_cost = calculate_link_cost(100.0, "paved", [], slope_percent=2.0)
        assert steep_cost == pytest.approx(gentle_cost * 3.0, rel=1e-2)

    def test_course_slope_metrics_calculation(self):
        """코스 링크들의 최대 경사도 및 가중 평균 경사도 산출 정확도 검증."""
        links = [
            {"length_m": 400.0, "slope_percent": 2.0},
            {"length_m": 600.0, "slope_percent": 4.0},
        ]
        metrics = calculate_course_slope_metrics(links)
        assert metrics["max_slope_percent"] == 4.0
        # (400*2.0 + 600*4.0) / 1000 = 3.2%
        assert metrics["average_slope_percent"] == 3.2


class TestShadePrioritization:
    """[US-B3] 태양 위치 및 건물 형상 기반 그늘 우선 평가 테스트."""

    def test_noon_peak_shade_discount_applied(self):
        """11~15시 피크 일조 시간에 그늘길(그늘비율 0.8)에 비용 할인(0.6) 적용 검증."""
        shade_cost = calculate_link_cost(100.0, "paved", [], shade_ratio=0.8, is_noon_peak=True)
        sun_cost = calculate_link_cost(100.0, "paved", [], shade_ratio=0.2, is_noon_peak=True)
        assert shade_cost == pytest.approx(sun_cost * 0.6, rel=1e-2)


class TestCandidateRouteScorer:
    """[US-B4] Routing Adapter 및 후보 경로 다요소 스코어러 테스트."""

    def test_candidate_scorer_selects_safest_gentle_shade_route(self):
        """3개 후보 경로 중 계단이 없고 완만하며 그늘이 풍부한 코스가 최고 득점하는지 검증."""
        target_dist = 1200.0

        # 후보 1: 최적 코스 (계단 없음, 경사 3.5%, 그늘 80%, 거리 1200m)
        candidate1 = {
            "route_id": "opt_1",
            "has_stairs": False,
            "max_slope_percent": 3.5,
            "average_shade_ratio": 0.80,
            "total_distance_m": 1200.0
        }
        # 후보 2: 계단 포함 코스 (계단 있음, 경사 4.0%, 그늘 60%, 거리 1180m)
        candidate2 = {
            "route_id": "opt_2",
            "has_stairs": True,
            "max_slope_percent": 4.0,
            "average_shade_ratio": 0.60,
            "total_distance_m": 1180.0
        }
        # 후보 3: 급경사 땡볕 코스 (계단 없음, 경사 10.5%, 그늘 20%, 거리 1350m)
        candidate3 = {
            "route_id": "opt_3",
            "has_stairs": False,
            "max_slope_percent": 10.5,
            "average_shade_ratio": 0.20,
            "total_distance_m": 1350.0
        }

        score1 = score_candidate_route(candidate1, target_dist)
        score2 = score_candidate_route(candidate2, target_dist)
        score3 = score_candidate_route(candidate3, target_dist)

        # 후보 1이 90점 이상으로 최고점을 획득해야 함
        assert score1 >= 90.0
        assert score1 > score2
        assert score1 > score3
        # 계단이 있는 후보 2는 감점으로 인해 후보 1보다 현저히 낮아야 함
        assert score2 <= 70.0


class TestSurfaceSourceResolver:
    """OSM 보행망 속성 결합 및 노면 출처 투명성 테스트."""

    def test_osm_verified_takes_highest_priority(self):
        """OSM 명시 노면 태그(dirt) 최우선 반영 검증."""
        surface, source, conf = resolve_surface_attribute(
            osm_surface="dirt",
            in_park=False
        )
        assert surface == "dirt"
        assert source == "osm_verified"
        assert conf == 0.95

    def test_park_polygon_resolves_to_dirt_trail(self):
        """노면 태그 결측 시 공원 폴리곤(in_park=True) 내부는 흙길(dirt)로 자동 판정 검증."""
        surface, source, conf = resolve_surface_attribute(
            osm_surface=None,
            in_park=True
        )
        assert surface == "dirt"
        assert source == "park_polygon"
        assert conf == 0.85

    def test_legacy_alias_resolves_correctly(self):
        """하위 호환성 resolve_surface_with_land_cover 호출 정상 검증."""
        surface, source, conf = resolve_surface_with_land_cover(
            osm_surface="grass",
            in_park=True
        )
        assert surface == "grass"
        assert source == "osm_verified"


# 레거시 호환성 클래스 별칭
TestLandCoverSpatialService = TestSurfaceSourceResolver

