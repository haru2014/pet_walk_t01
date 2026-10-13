"""[US-G2] 200m 공간 마스킹 및 교차로(Node) 스냅 절단 TDD 단위 테스트.

역추적 공격(Trajectory Inference Attack) 방지를 위한:
1. 출발지/도착지 200m 기본 반경 절단
2. 도로망 다중 분기 교차로(Node, Degree >= 3) 스냅 절단
3. 궤적 코너(회전각 >= 35도) 변곡점 스냅 절단
"""

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
        dest = [127.1030, 37.4025]

        coords = [origin, p_100m, p_210m, p_corner, p_turned, dest]

        res = apply_spatial_masking_to_course(coords, masking_radius_m=200.0, snap_to_intersection=True)
        assert res["is_masked"] is True
        assert res["intersection_snapped"] is True

        # 시작점이 직선 골목 중간(p_210m)이 아닌, 갈림길 코너(p_corner)로 스냅되어야 함
        assert res["masked_coordinates"][0] == p_corner
        assert res["start_intersection"]["type"] == "trajectory_corner_snap"
