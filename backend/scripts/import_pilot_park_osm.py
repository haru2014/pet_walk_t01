"""Refresh pilot park boundaries and walking ways from the OSM map API.

Names/IDs select parks; a route buffer is never used as a park boundary.
Missing named parks retain their geometry for audit only, marked unverified.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

from shapely.geometry import LineString, Polygon, mapping

ROOT = Path(__file__).resolve().parents[1]
QUERIES = {
    "songgang": ("127.378,36.430,127.387,36.437", "송강공원", "564388430"),
    "yurim": ("127.350,36.357,127.362,36.367", "유림공원", None),
    "sejong": ("127.250,36.490,127.290,36.515", "세종호수공원", None),
    "doan": ("127.335,36.337,127.350,36.350", "도안호수공원", None),
}


def main():
    retrieved_at = datetime.now(timezone.utc).date().isoformat()
    features = []
    networks = {}
    old = json.loads((ROOT / "fixtures/park_polygons_pilot.json").read_text(encoding="utf-8"))
    old_by_id = {f["properties"]["park_id"]: f for f in old["features"]}
    for park_id, (bbox, name, way_id) in QUERIES.items():
        url = f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"
        request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-boundary-audit/1.0"})
        with urllib.request.urlopen(request, timeout=30) as response:
            root = ET.fromstring(response.read())
        nodes = {n.attrib["id"]: [float(n.attrib["lon"]), float(n.attrib["lat"])] for n in root.findall("node")}
        ways = []
        matches = []
        for way in root.findall("way"):
            tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
            refs = [nd.attrib["ref"] for nd in way.findall("nd")]
            if any(ref not in nodes for ref in refs):
                continue
            coords = [nodes[ref] for ref in refs]
            if tags.get("leisure") == "park" and (way.attrib["id"] == way_id if way_id else tags.get("name") == name):
                if len(coords) >= 4 and coords[0] == coords[-1]:
                    matches.append((way, Polygon(coords)))
            if tags.get("highway") in ("footway", "path", "pedestrian") and tags.get("access") not in ("private", "no") and tags.get("foot") not in ("private", "no"):
                ways.append({"way_id": way.attrib["id"], "version": way.attrib["version"], "tags": tags, "coordinates": coords})
        if len(matches) != 1 or not matches[0][1].is_valid:
            feature = old_by_id[park_id]
            feature["properties"].update(quality="unverified", source="legacy_without_provenance", crs="EPSG:4326")
            features.append(feature)
            print(park_id, "BOUNDARY_DATA_UNAVAILABLE")
            continue
        way, poly = matches[0]
        source = f"https://www.openstreetmap.org/way/{way.attrib['id']}"
        properties = {
            "park_id": park_id, "name": name, "quality": "verified_osm",
            "source": source, "source_version": way.attrib["version"],
            "source_updated_at": way.attrib["timestamp"], "retrieved_at": retrieved_at,
            "crs": "EPSG:4326", "license": "ODbL-1.0", "attribution": "© OpenStreetMap contributors",
        }
        features.append({"type": "Feature", "properties": properties, "geometry": mapping(poly)})
        relevant = [w for w in ways if len(w["coordinates"]) >= 2 and poly.intersects(LineString(w["coordinates"]))]
        networks[park_id] = {"source": url, "boundary_source": source, "retrieved_at": retrieved_at, "ways": relevant}
        print(park_id, source, poly.bounds, "ways", len(relevant))
    (ROOT / "fixtures/park_polygons_pilot.json").write_text(json.dumps({"type": "FeatureCollection", "features": features}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (ROOT / "fixtures/park_walk_networks_pilot.json").write_text(json.dumps(networks, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
