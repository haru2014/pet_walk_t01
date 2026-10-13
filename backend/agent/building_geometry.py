"""[US-A3, US-B1] 건물 관통 방지(Building Avoidance) 공간 교차 검사 모듈.

산책 경로 Polyline 선분(LineSegment)이 건물 외곽선 폴리곤(Building Polygon)을
대각선이나 사선으로 관통하지 않고 실제 도로망/인도 위를 지나는지 Shapely 기반으로 검증한다.
"""

import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from shapely.geometry import LineString, Point, Polygon


def load_building_polygons(geojson_path: str | Path) -> List[Polygon]:
    """건물 GeoJSON 파일에서 Polygon 객체 목록을 로드한다."""
    path = Path(geojson_path)
    if not path.exists():
        return []

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    polygons: List[Polygon] = []
    for feature in data.get("features", []):
        geom = feature.get("geometry", {})
        gtype = geom.get("type")
        coords = geom.get("coordinates", [])
        if gtype == "Polygon" and coords:
            # coords[0] 은 외곽 링
            poly = Polygon(coords[0])
            if poly.is_valid and not poly.is_empty:
                polygons.append(poly)
        elif gtype == "MultiPolygon" and coords:
            for part in coords:
                poly = Polygon(part[0])
                if poly.is_valid and not poly.is_empty:
                    polygons.append(poly)
    return polygons


def count_building_penetrations(
    coords: Sequence[Sequence[float]],
    polygons: Sequence[Polygon],
    tolerance: float = 1e-7,
) -> Tuple[int, int, float, List[Dict[str, Any]]]:
    """경로 선분들이 건물 폴리곤 내부를 관통하는지 정밀 검사한다.

    반환값:
        (관통 선분 개수, 총 선분 개수, 관통 선분 비율 0.0~1.0, 위반 상세 목록)
    """
    if len(coords) < 2 or not polygons:
        return 0, max(0, len(coords) - 1), 0.0, []

    penetrations: List[Dict[str, Any]] = []
    total_segments = len(coords) - 1

    for idx in range(total_segments):
        p1 = coords[idx]
        p2 = coords[idx + 1]
        line = LineString([p1, p2])

        # 선분 중점
        mid_pt = Point((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)

        for poly_idx, poly in enumerate(polygons):
            # 중점이 건물 폴리곤 내부(경계선 제외)에 있는 경우 -> 완전 관통
            if poly.contains(mid_pt):
                penetrations.append({
                    "segment_index": idx,
                    "coords": [list(p1), list(p2)],
                    "polygon_index": poly_idx,
                    "reason": "midpoint_inside_building",
                })
                break

            # 선분과 폴리곤의 교차가 1차원 선분 형태(LineString)로 내부를 가로지르는 경우
            inter = line.intersection(poly)
            if not inter.is_empty and inter.geom_type in ("LineString", "MultiLineString"):
                # 단순히 건물 벽면 경계(Boundary)에 접하거나 스치는 경우는 제외 (보도와 건물벽이 붙어있는 경우 허용)
                boundary_dist = inter.distance(poly.boundary)
                if boundary_dist > tolerance or poly.buffer(-1e-6).intersects(inter):
                    penetrations.append({
                        "segment_index": idx,
                        "coords": [list(p1), list(p2)],
                        "polygon_index": poly_idx,
                        "reason": "crosses_building_interior",
                    })
                    break

    penetration_count = len(penetrations)
    penetration_ratio = (penetration_count / total_segments) if total_segments > 0 else 0.0
    return penetration_count, total_segments, penetration_ratio, penetrations


def verify_building_avoidance(
    coords: Sequence[Sequence[float]],
    polygons: Sequence[Polygon],
    max_allowed_ratio: float = 0.0,
) -> bool:
    """건물 관통 선분 비율이 허용치(기본 0.0%) 이하인지 검증한다."""
    count, total, ratio, _ = count_building_penetrations(coords, polygons)
    return ratio <= max_allowed_ratio
