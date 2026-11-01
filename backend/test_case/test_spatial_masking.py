"""[US-G2] 200m 공간 마스킹 및 교차로(Node) 스냅 절단 TDD 단위 테스트.

역추적 공격(Trajectory Inference Attack) 방지를 위한:
1. 출발지/도착지 200m 기본 반경 절단
2. 도로망 다중 분기 교차로(Node, Degree >= 3) 스냅 절단
3. 궤적 코너(회전각 >= 35도) 변곡점 스냅 절단
"""

import math

import pytest
from agent.spatial_masking import (
    apply_spatial_masking_to_course,
    calculate_haversine_distance_m,
    get_network_intersections,
)
from agent.offline_walk_network import SEOUL_CENTER_NODES


class TestSpatialMaskingWithIntersectionSnap:
    """교차로(Node) 스냅 절단 공간 마스킹 검증 테스트."""

    def test_basic_distance_masking_without_snap(self):
        """snap_to_intersection=False 시 단순 200m 거리 기준 절단 동작 확인."""
        coords = [
            [127.0, 37.500],  # 0m
            [127.0, 37.501],  # 약 111m
            [127.0, 37.502],  # 약 222m (> 200m)
            [127.0, 37.503],  # 약 333m
            [127.0, 37.504],  # 약 444m
            [127.0, 37.505],  # 약 555m
            [127.0, 37.506],  # 666m
        ]
        res = apply_spatial_masking_to_course(coords, masking_radius_m=200.0, snap_to_intersection=False)
        assert res["is_masked"] is True
        assert len(res["masked_coordinates"]) == 3
        assert [127.0, 37.500] not in res["masked_coordinates"]
        assert [127.0, 37.506] not in res["masked_coordinates"]

    def test_intersection_snap_to_network_node(self):
        """200m 이후 실제 도로망 교차로(sc_cityhall_front 등 Degree>=3)가 있는 경우 해당 교차로로 정확히 스냅되는지 검증."""
        # 서울광장 남측(자택 출발 가정) -> 무교로 -> 청계천 방면
        # sc_plaza_south [126.9784, 37.5656] 에서 출발
        # 200m 이상 떨어진 지점의 sc_mugyo_north 또는 교차로 노드로 스냅
        intersections = get_network_intersections()
        assert len(intersections) > 0

        # 출발: 자택 (서울광장 남측에서 남쪽 골목)
        origin = [126.9784, 37.5630]
        p1 = [126.9784, 37.5640]  # 약 111m (200m 이내 마스킹)
        p2 = [126.9784, 37.5649]  # 약 211m (200m 초과하는 단순 직선 골목길)
        p3 = [126.9784, 37.5656]  # sc_plaza_south (실제 3거리 교차로 Node, Degree=3)
        p4 = [126.9784, 37.5663]  # sc_plaza_center (교차로 Node, Degree=4)
        p5 = [126.9790, 37.5668]  # sc_cityhall_east
        dest = [126.9792, 37.5715] # 귀가 지점

        trajectory = [origin, p1, p2, p3, p4, p5, dest]

        res = apply_spatial_masking_to_course(trajectory, masking_radius_m=200.0, snap_to_intersection=True)
        assert res["is_masked"] is True
        assert res["intersection_snapped"] is True

        # 시작점이 단순 200m 초과점인 직선 골목(p2)이 아니라, 다중 분기 교차로인 p3(sc_plaza_south)로 전진 스냅되었는지 확인
        first_pt = res["masked_coordinates"][0]
        assert first_pt == p3
        assert res["start_intersection"] is not None
        assert res["start_intersection"]["type"] == "network_intersection"
        assert res["start_intersection"]["node_id"] == "sc_plaza_south"
        assert res["start_intersection"]["degree"] >= 3

    def test_trajectory_corner_snap_in_unmapped_area(self):
        """도로망 DB 외곽 지역에서도 200m 이후 회전 코너(각도 >= 35도)로 스냅하여 외길 역추적을 차단하는지 검증."""
        # 200m까지는 직선 골목길, 250m 지점에서 직각 90도 우회전 코너가 있는 경우
        origin = [127.1000, 37.4000]
        p_100m = [127.1000, 37.4009]  # ~100m
        p_210m = [127.1000, 37.4019]  # ~210m (직선 상의 200m 초과점)
        p_corner = [127.1000, 37.4025] # ~277m (90도 꺾이는 삼거리/코너)
        p_turned = [127.1015, 37.4025] # 우회전 후 진행
        p_far = [127.1040, 37.4025]
        dest = [127.1100, 37.4025]  # 코너 뒤로 경로가 충분히 이어진다 (코너 1개 뿐인 경로는 아래 #237 테스트)

        coords = [origin, p_100m, p_210m, p_corner, p_turned, p_far, dest]

        res = apply_spatial_masking_to_course(coords, masking_radius_m=200.0, snap_to_intersection=True)
        assert res["is_masked"] is True
        assert res["intersection_snapped"] is True

        # 시작점이 직선 골목 중간(p_210m)이 아닌, 갈림길 코너(p_corner)로 스냅되어야 함
        assert res["masked_coordinates"][0] == p_corner
        assert res["start_intersection"]["type"] == "trajectory_corner_snap"


class TestReentryAudit:
    """200m 마스킹 감사(2026-10-18): 끝을 자른 뒤 경로 중간이 집 반경 안으로 다시 들어오는 경우."""
    HOME = (127.3780, 36.3510)  # [lon, lat] 가상 자택 (대전 둔산동)

    def _pt(self, dx_m, dy_m):
        return [self.HOME[0] + dx_m / (111320 * math.cos(math.radians(self.HOME[1]))), self.HOME[1] + dy_m / 110570]

    def _line(self, a, b, n):
        return [self._pt(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n + 1)]

    def _min_distance_to_home(self, coords):
        """남은 경로의 선분까지 포함한 자택 최소 거리(m, 평면 근사)."""
        kx, ky = 111320 * math.cos(math.radians(self.HOME[1])), 110570
        best = float("inf")
        for a, b in zip(coords, coords[1:]):
            ax, ay = (a[0] - self.HOME[0]) * kx, (a[1] - self.HOME[1]) * ky
            bx, by = (b[0] - self.HOME[0]) * kx, (b[1] - self.HOME[1]) * ky
            dx, dy = bx - ax, by - ay
            t = max(0.0, min(1.0, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0.0
            best = min(best, math.hypot(ax + t * dx, ay + t * dy))
        return best

    def test_figure_eight_passing_home_again_is_cut(self):
        route = (self._line((0, 0), (500, 0), 25) + self._line((500, 0), (500, 300), 15)[1:]
                 + self._line((500, 300), (-60, 30), 28)[1:] + self._line((-60, 30), (-500, 0), 22)[1:]
                 + self._line((-500, 0), (-500, -300), 15)[1:] + self._line((-500, -300), (0, 0), 28)[1:])
        res = apply_spatial_masking_to_course(route, masking_radius_m=200.0)
        assert res["reentry_removed_points"] > 0
        assert len(res["masked_coordinates"]) >= 2
        assert self._min_distance_to_home(res["masked_coordinates"]) > 200.0  # 수정 전: 53m 까지 접근

    def test_segment_crossing_the_home_circle_is_cut(self):
        """GPS 점은 모두 반경 밖이지만 두 점을 잇는 선분이 집 원을 가로지르는 경우."""
        route = [self._pt(0, 0), self._pt(0, 150), self._pt(0, 300), self._pt(300, 300), self._pt(300, -250),
                 self._pt(-300, 250), self._pt(-300, -300), self._pt(0, -300), self._pt(0, -150), self._pt(0, 0)]
        res = apply_spatial_masking_to_course(route, masking_radius_m=200.0)
        assert self._min_distance_to_home(res["masked_coordinates"]) > 200.0

    def test_ordinary_loop_is_unchanged(self):
        route = (self._line((0, 0), (600, 0), 30) + self._line((600, 0), (600, 400), 20)[1:]
                 + self._line((600, 400), (0, 400), 30)[1:] + self._line((0, 400), (0, 0), 20)[1:])
        res = apply_spatial_masking_to_course(route, masking_radius_m=200.0)
        assert res["reentry_removed_points"] == 0 and len(res["masked_coordinates"]) == 51


def test_walk_plan_log_does_not_keep_the_exact_origin(caplog):
    """현재 위치 출발 좌표(자택일 수 있음)를 운영 로그에 정밀하게 남기지 않는다 (200m 마스킹 감사)."""
    from fastapi.testclient import TestClient
    import main
    with caplog.at_level("INFO"):
        TestClient(main.app).post("/api/v1/walk/plan", json={"origin_lat": 36.351234, "origin_lon": 127.378456,
                                                             "target_duration_minutes": 30})
    logged = [r.getMessage() for r in caplog.records if "walk_plan_requested" in r.getMessage()]
    assert logged and "127.378456" not in logged[0] and "36.351234" not in logged[0]
    assert '"origin_approx": [127.38, 36.35]' in logged[0]


class TestSnapDoesNotCollapseRoute:
    """[#237] 코너가 하나뿐인 긴 경로에서 시작·끝 스냅이 같은 코너로 모여 점 1개가 되던 문제."""

    LAT0 = 36.3600  # 대전, 도로망 교차로 자료 밖
    LON0 = 127.3500
    M_LAT = 111_000.0
    M_LON = 111_000.0 * math.cos(math.radians(36.36))

    def _pt(self, north_m, east_m):
        return [self.LON0 + east_m / self.M_LON, self.LAT0 + north_m / self.M_LAT]

    def _one_corner_route(self, leg2_m):
        """북쪽으로 300m 간 뒤 한 번 꺾어 동쪽으로 leg2_m 가는 경로(20m 간격)."""
        route = [self._pt(n, 0) for n in range(0, 301, 20)]
        route += [self._pt(300, e) for e in range(20, int(leg2_m) + 1, 20)]
        return route

    @pytest.mark.parametrize("leg2_m", [500, 2000, 6000])
    def test_one_corner_route_keeps_a_shareable_route(self, leg2_m):
        masked = apply_spatial_masking_to_course(self._one_corner_route(leg2_m), masking_radius_m=200.0)
        assert len(masked["masked_coordinates"]) >= 2

    def test_masked_route_never_includes_first_or_last_200m(self):
        route = self._one_corner_route(2000)
        masked = apply_spatial_masking_to_course(route, masking_radius_m=200.0)
        origin = (route[0][1], route[0][0])
        destination = (route[-1][1], route[-1][0])
        for lon, lat in masked["masked_coordinates"]:
            assert calculate_haversine_distance_m(origin, (lat, lon)) > 200.0
            assert calculate_haversine_distance_m(destination, (lat, lon)) > 200.0
