"""산책 시작·완료 지점(privacy_anchors) 기준 200m 개인정보 보호.

경로 이탈 후 재탐색 등으로 공유 좌표열의 첫 점이 실제 산책 시작 지점과 달라도,
앱이 보낸 산책 시작·완료 지점 반경 200m 는 공개 경로에서 빠져야 한다.
"""

from agent.spatial_masking import apply_spatial_masking_to_course, calculate_haversine_distance_m

LAT = 36.36
STEP_DEG = 0.0002  # 위도 0.0002도 ≈ 22m


def _line(start_lon, n):
    return [[start_lon + i * STEP_DEG, LAT] for i in range(n)]


def _min_distance_to(coords, point):
    return min(calculate_haversine_distance_m((point[1], point[0]), (c[1], c[0])) for c in coords)


def test_anchor_far_from_coordinate_ends_is_masked():
    """좌표열이 집(산책 시작)에서 약 400m 떨어진 재탐색 지점부터 시작해 집 앞을 지나가도, 집 반경 200m 는 가린다."""
    home = [127.3800, LAT]
    # 집 동쪽 약 400m(재탐색 지점) → 서쪽으로 집 앞을 지나 → 집 서쪽 약 600m 에서 종료
    coords = [[127.3800 + 0.0045 - i * STEP_DEG, LAT] for i in range(57)]
    without_anchor = apply_spatial_masking_to_course(coords, snap_to_intersection=False)["masked_coordinates"]
    assert _min_distance_to(without_anchor, home) <= 200  # 좌표 양 끝만 보면 집 앞이 공개된다

    masked = apply_spatial_masking_to_course(
        coords, snap_to_intersection=False, privacy_anchors=[home]
    )["masked_coordinates"]
    assert len(masked) >= 2
    assert _min_distance_to(masked, home) > 200


def test_start_and_end_anchors_are_both_masked():
    home = [127.3800, LAT]
    finish = [127.3800 + 0.0089, LAT]  # 약 800m 동쪽에서 산책 종료
    coords = _line(127.3800, 46)  # 집 → 완료 지점까지 약 1km
    masked = apply_spatial_masking_to_course(
        coords, snap_to_intersection=False, privacy_anchors=[home, finish]
    )["masked_coordinates"]
    assert len(masked) >= 2
    assert _min_distance_to(masked, home) > 200
    assert _min_distance_to(masked, finish) > 200


def test_no_anchor_keeps_previous_behavior():
    coords = _line(127.3800, 60)
    assert apply_spatial_masking_to_course(coords, snap_to_intersection=False) == apply_spatial_masking_to_course(
        coords, snap_to_intersection=False, privacy_anchors=None
    )
