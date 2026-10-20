"""Refresh pilot park boundaries and walking ways from the OSM map API.

Names/IDs select parks; a route buffer is never used as a park boundary.
Missing named parks retain their geometry for audit only, marked unverified.
A park can be a closed way or a multipolygon relation ("relation/<id>").

Usage (backend 폴더에서):
    python scripts/import_pilot_park_osm.py              # 4개 거점 전부 갱신
    python scripts/import_pilot_park_osm.py sejong doan  # 지정한 거점만 갱신, 나머지는 그대로 둔다
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, Polygon, mapping
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parents[1]
QUERIES = {
    "songgang": ("127.378,36.430,127.387,36.437", "송강공원", "way/564388430"),
    "yurim": ("127.350,36.357,127.362,36.367", "유림공원", None),
    "sejong": ("127.267,36.491,127.283,36.505", "세종호수공원", "relation/9734480"),
    "doan": ("127.347,36.324,127.355,36.338", "갑천 생태호수공원", "relation/19159630"),
}
WALK_HIGHWAYS = ("footway", "path", "pedestrian")
# 세종호수공원은 공원 안 길 일부가 자전거도로로만 등록돼 보행망이 끊긴다. 보행 금지 표시가 없으면 넣는다 (#148)
CYCLEWAY_PARKS = {"sejong"}


def _fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-boundary-audit/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return ET.fromstring(response.read())


def _relation_polygon(relation_id, name):
    """multipolygon relation 의 outer/inner 멤버로 경계를 만든다. 이름이 다르거나 도형이 잘못되면 None."""
    root = _fetch(f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full")
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in root.findall("node")}
    ways = {w.attrib["id"]: [nodes[nd.attrib["ref"]] for nd in w.findall("nd")] for w in root.findall("way")}
    relation = root.find(f"relation[@id='{relation_id}']")
    tags = {tag.attrib["k"]: tag.attrib["v"] for tag in relation.findall("tag")}
    if tags.get("leisure") != "park" or tags.get("name") != name:
        return None
    rings = {"outer": [], "inner": []}
    for member in relation.findall("member"):
        role = member.attrib.get("role") or "outer"
        if member.attrib["type"] == "way" and role in rings:
            rings[role].append(LineString(ways[member.attrib["ref"]]))
    shell = unary_union(list(polygonize(unary_union(rings["outer"]))))
    if rings["inner"]:
        shell = shell.difference(unary_union(list(polygonize(unary_union(rings["inner"])))))
    if shell.is_empty or not shell.is_valid:
        return None
    return relation, shell


def main(selected=None):
    retrieved_at = datetime.now(timezone.utc).date().isoformat()
    old = json.loads((ROOT / "fixtures/park_polygons_pilot.json").read_text(encoding="utf-8"))
    old_by_id = {f["properties"]["park_id"]: f for f in old["features"]}
    old_networks = json.loads((ROOT / "fixtures/park_walk_networks_pilot.json").read_text(encoding="utf-8"))
    features = []
    networks = {}
    for park_id, (bbox, name, osm_ref) in QUERIES.items():
        if selected and park_id not in selected:
            features.append(old_by_id[park_id])
            if park_id in old_networks:
                networks[park_id] = old_networks[park_id]
            continue
        url = f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"
        root = _fetch(url)
        nodes = {n.attrib["id"]: [float(n.attrib["lon"]), float(n.attrib["lat"])] for n in root.findall("node")}
        ways = []
        matches = []
        osm_type, _, osm_id = (osm_ref or "").partition("/")
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            refs = [nd.attrib["ref"] for nd in way.findall("nd")]
            if any(ref not in nodes for ref in refs):
                continue
            coords = [nodes[ref] for ref in refs]
            if osm_type != "relation" and tags.get("leisure") == "park" and (way.attrib["id"] == osm_id if osm_id else tags.get("name") == name):
                if len(coords) >= 4 and coords[0] == coords[-1]:
                    matches.append((way, Polygon(coords)))
            highways = WALK_HIGHWAYS + (("cycleway",) if park_id in CYCLEWAY_PARKS else ())
            if tags.get("highway") in highways and tags.get("access") not in ("private", "no") and tags.get("foot") not in ("private", "no"):
                ways.append({"way_id": way.attrib["id"], "version": way.attrib["version"], "tags": tags, "coordinates": coords})
        if osm_type == "relation":
            found = _relation_polygon(osm_id, name)
            matches = [found] if found else []
        if len(matches) != 1 or not matches[0][1].is_valid:
            feature = old_by_id[park_id]
            feature["properties"].update(quality="unverified", source="legacy_without_provenance", crs="EPSG:4326")
            features.append(feature)
            print(park_id, "BOUNDARY_DATA_UNAVAILABLE")
            continue
        element, poly = matches[0]
        source = f"https://www.openstreetmap.org/{osm_type if osm_type == 'relation' else 'way'}/{element.attrib['id']}"
        properties = {
            "park_id": park_id, "name": name, "quality": "verified_osm",
            "source": source, "source_version": element.attrib["version"],
            "source_updated_at": element.attrib["timestamp"], "retrieved_at": retrieved_at,
            "crs": "EPSG:4326", "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors",
        }
        features.append({"type": "Feature", "properties": properties, "geometry": mapping(poly)})
        relevant = [w for w in ways if len(w["coordinates"]) >= 2 and poly.intersects(LineString(w["coordinates"]))]
        networks[park_id] = {"source": url, "boundary_source": source, "retrieved_at": retrieved_at, "ways": relevant}
        print(park_id, source, poly.bounds, "ways", len(relevant))
    (ROOT / "fixtures/park_polygons_pilot.json").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "fixtures/park_walk_networks_pilot.json").write_text(json.dumps(networks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main(set(sys.argv[1:]) or None)
