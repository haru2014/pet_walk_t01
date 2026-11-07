"""[US-B1, US-B3, US-20] Overpass 응답(JSON)을 경로 탐색이 쓰는 OsmRegion 으로 정리한다.

수집 범주와 Overpass 질의문이 한곳에 있어야 어긋나지 않으므로 QUERY_TEMPLATE 도 여기에 둔다.
받아 오는 일(서버·캐시·타임아웃)은 agent/osm_overpass_client 가 맡는다.

좌표는 모두 [경도, 위도]이다.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

SOURCE = "OpenStreetMap Overpass API (ODbL)"

REST_AMENITIES = ("bench", "shelter", "drinking_water", "toilets")
REST_LEISURE = ("picnic_table", "pavilion")
WATER_WAYS = ("river", "stream", "canal")
RAILWAYS = ("rail", "light_rail", "subway", "tram", "narrow_gauge")

QUERY_TEMPLATE = """[out:json][timeout:9];
(
  way["highway"]({bbox});
  node["highway"="crossing"]({bbox});
  node["amenity"~"^(bench|shelter|drinking_water|toilets)$"]({bbox});
  node["leisure"~"^(picnic_table|pavilion)$"]({bbox});
  way["leisure"~"^(park|garden|pavilion)$"]({bbox});
  way["amenity"="shelter"]({bbox});
  way["landuse"~"^(commercial|retail|forest)$"]({bbox});
  way["natural"~"^(wood|tree_row|water)$"]({bbox});
  way["waterway"~"^(river|stream|canal)$"]({bbox});
  way["railway"~"^(rail|light_rail|subway|tram|narrow_gauge)$"]({bbox});
);
out geom qt;"""

# (태그, 값 목록) → 자료를 담을 OsmRegion 필드 이름
AREA_RULES = (
    ("leisure", ("park", "garden"), "parks"),
    ("landuse", ("commercial", "retail"), "commercial"),
    ("natural", ("wood",), "shade_areas"),
    ("landuse", ("forest",), "shade_areas"),
    ("natural", ("tree_row",), "shade_lines"),
)


@dataclass
class OsmRegion:
    """출발지 주변 OSM 자료. 좌표는 모두 [경도, 위도]."""
    center: Tuple[float, float]
    radius_m: float
    ways: List[Dict[str, Any]] = field(default_factory=list)          # {"id", "tags", "coords"}
    crossings: List[List[float]] = field(default_factory=list)
    rest_points: List[List[float]] = field(default_factory=list)
    parks: List[List[List[float]]] = field(default_factory=list)
    commercial: List[List[List[float]]] = field(default_factory=list)
    shade_areas: List[List[List[float]]] = field(default_factory=list)
    shade_lines: List[List[List[float]]] = field(default_factory=list)
    # 다리 없이는 건너지 못하는 선: 물길 중심선·물 영역 테두리·철로
    barrier_lines: List[List[List[float]]] = field(default_factory=list)
    # 그 선을 건너는 수단: 다리(bridge)·터널(tunnel)로 태그된 길
    crossing_structures: List[List[List[float]]] = field(default_factory=list)
    osm_base: Optional[str] = None


def _geometry(element: Dict[str, Any]) -> List[List[float]]:
    return [[p["lon"], p["lat"]] for p in element.get("geometry") or [] if "lon" in p and "lat" in p]


def _centroid(coords: List[List[float]]) -> List[float]:
    """면으로 그려진 쉼터(정자 등)를 한 점으로 다룬다."""
    return [sum(c[0] for c in coords) / len(coords), sum(c[1] for c in coords) / len(coords)]


def _is_bridge_or_tunnel(tags: Dict[str, Any]) -> bool:
    return tags.get("bridge") not in (None, "no") or tags.get("tunnel") not in (None, "no")


def _sort_barrier_way(region: OsmRegion, tags: Dict[str, Any], coords: List[List[float]]) -> None:
    """못 건너는 선(물길·철로)과 그것을 건너는 수단(다리·터널)을 나눠 담는다."""
    if _is_bridge_or_tunnel(tags):
        if "highway" in tags or "railway" in tags:
            region.crossing_structures.append(coords)
        return  # 다리 위·터널 안의 물길·철로는 아래위로 지나갈 수 있어 막는 선이 아니다
    if tags.get("waterway") in WATER_WAYS or tags.get("natural") == "water" or tags.get("railway") in RAILWAYS:
        region.barrier_lines.append(coords)


def _sort_way(region: OsmRegion, element: Dict[str, Any]) -> None:
    tags = element.get("tags") or {}
    coords = _geometry(element)
    if len(coords) < 2:
        return
    if "highway" in tags:
        region.ways.append({"id": str(element.get("id")), "tags": tags, "coords": coords})
    for tag, values, field_name in AREA_RULES:
        if tags.get(tag) in values:
            getattr(region, field_name).append(coords)
    if tags.get("leisure") == "pavilion" or tags.get("amenity") == "shelter":
        region.rest_points.append(_centroid(coords))
    _sort_barrier_way(region, tags, coords)


def _sort_node(region: OsmRegion, element: Dict[str, Any]) -> None:
    tags = element.get("tags") or {}
    point = [element.get("lon"), element.get("lat")]
    if None in point:
        return
    if tags.get("highway") == "crossing":
        region.crossings.append(point)
    if tags.get("amenity") in REST_AMENITIES or tags.get("leisure") in REST_LEISURE:
        region.rest_points.append(point)


def parse_overpass(payload: Dict[str, Any], center: Tuple[float, float], radius_m: float) -> OsmRegion:
    """Overpass JSON(out geom) → OsmRegion."""
    base = (payload.get("osm3s") or {}).get("timestamp_osm_base")
    region = OsmRegion(center=center, radius_m=radius_m, osm_base=base)
    for element in payload.get("elements") or []:
        if element.get("type") == "way":
            _sort_way(region, element)
        elif element.get("type") == "node":
            _sort_node(region, element)
    return region
