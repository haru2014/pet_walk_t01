"""공원 경계 밖 주차장에서 공원 보행망까지의 진입로를 OSM 보행로로 만든다 (#160).

공원 경로는 경계 안 보행망만 쓴다. 경계 밖 주차장은 공원 보행망에 바로 붙지 못하므로,
주차장 바로 옆 길 지점부터 공원 보행망(가장 큰 연결 조각)까지 가장 짧은 길을 저장한다.
- 보행 전용 길: footway·path·pedestrian·cycleway·living_street
- 주택가·이면도로: residential·unclassified·service (#183. 한국 OSM 에는 도로 옆 인도가 따로 그려지지 않은 곳이 많다.
  자전거도로를 넣은 #148 과 같은 기준 "경로가 자연스럽게 이어지는 것이 우선". 큰 도로(tertiary 이상)는 넣지 않는다)
- 계단, foot/access=no·private 는 제외. 거리가 비슷하면 보행 전용 길을 고르도록 도로 구간은 ROAD_COST_FACTOR 배로 계산한다.
- 길이 상한 MAX_APPROACH_M (실제 거리). 넘으면 저장하지 않는다.
- OSM 주차장 도형이 있으면: 도형 꼭짓점 START_RADIUS_M 안의 길 지점 중 공원까지 가장 가까운 곳에서 시작하고,
  출입구 좌표는 그 시작점에 가장 가까운 꼭짓점으로 출력한다 (parking_lots_pilot.json 에 반영).
- 도형이 없으면(공공데이터 주차장): 지금 출입구 좌표 POINT_START_RADIUS_M 안의 길 지점에서 시작한다.

사용법 (backend 폴더에서):
    python scripts/build_park_entry_approaches.py
결과: fixtures/park_entry_approaches_pilot.json (© OpenStreetMap contributors, ODbL)
"""
import json
import sys
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import networkx as nx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from agent.park_route_validation import build_park_graph  # noqa: E402
from agent.route_geometry import haversine_m  # noqa: E402

TARGET = ROOT / "fixtures" / "park_entry_approaches_pilot.json"
MAX_APPROACH_M = 600.0
# 진입로가 필요한 주차장: 공식 확인된 주차장 중 공원 경계 밖이라 공원 보행망에 바로 붙지 못하는 곳
LOTS = {
    "pkg_sejong_02": ("sejong", "468779885"),
    "pkg_sejong_03": ("sejong", "468776753"),
    "std_186-2-000003": ("songgang", None),  # 공공데이터 주차장 (OSM 도형 없음)
}
WALK_HIGHWAYS = {"footway", "path", "pedestrian", "cycleway", "living_street"}
ROAD_HIGHWAYS = {"residential", "unclassified", "service"}
ROAD_COST_FACTOR = 1.5
BLOCKED = {"no", "private"}
START_RADIUS_M = 40.0  # 주차장 도형 꼭짓점에서 이 거리 안의 길 지점만 진입로 시작점이 될 수 있다
POINT_START_RADIUS_M = 60.0  # 도형이 없는 주차장: 출입구 좌표에서 이 거리 안의 길 지점
PARKING_LOTS = ROOT / "fixtures" / "parking_lots_pilot.json"
SEARCH_DEG = 0.008  # 주차장 주변 약 700~900m 범위의 지도 자료를 받는다


def _fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PetWalk-entry-approach/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return ET.fromstring(response.read())


def _parking_vertices(way_id):
    root = _fetch(f"https://api.openstreetmap.org/api/0.6/way/{way_id}/full")
    nodes = {n.attrib["id"]: (float(n.attrib["lon"]), float(n.attrib["lat"])) for n in root.findall("node")}
    way = root.find("way")
    return [nodes[nd.attrib["ref"]] for nd in way.findall("nd")], way.attrib["version"]


def _walk_graph(center):
    lon, lat = center
    bbox = f"{lon - SEARCH_DEG:.4f},{lat - SEARCH_DEG:.4f},{lon + SEARCH_DEG:.4f},{lat + SEARCH_DEG:.4f}"
    root = _fetch(f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}")
    nodes = {n.attrib["id"]: [float(n.attrib["lon"]), float(n.attrib["lat"])] for n in root.findall("node")}
    graph = nx.Graph()
    for way in root.findall("way"):
        tags = {t.attrib["k"]: t.attrib["v"] for t in way.findall("tag")}
        highway = tags.get("highway")
        if highway not in WALK_HIGHWAYS | ROAD_HIGHWAYS or tags.get("foot") in BLOCKED or tags.get("access") in BLOCKED:
            continue
        factor = ROAD_COST_FACTOR if highway in ROAD_HIGHWAYS else 1.0
        coords = [nodes[nd.attrib["ref"]] for nd in way.findall("nd") if nd.attrib["ref"] in nodes]
        for a, b in zip(coords, coords[1:]):
            if a != b:
                length = haversine_m(a, b)
                graph.add_edge(tuple(a), tuple(b), weight=length, cost=length * factor,
                               way_id=way.attrib["id"], road=highway in ROAD_HIGHWAYS)
    return graph


def _entrance_point(parking_id):
    lots = json.loads(PARKING_LOTS.read_text(encoding="utf-8"))["parking_lots"]
    lot = next(item for item in lots if item["parking_id"] == parking_id)
    return (lot["entrance_lon"], lot["entrance_lat"])


def build_approach(park_id, parking_id, parking_way_id):
    if parking_way_id:
        vertices, version = _parking_vertices(parking_way_id)
        radius = START_RADIUS_M
    else:
        vertices, version, radius = [_entrance_point(parking_id)], None, POINT_START_RADIUS_M
    park = build_park_graph(park_id)
    park_nodes = max(nx.connected_components(park), key=len)
    walk = _walk_graph(vertices[0])
    sources = [node for node in park_nodes if node in walk]
    if not sources:
        return None
    # 공원 보행망에서 거꾸로 거리를 재고(도로는 ROAD_COST_FACTOR 배), 주차장 radius 안의 길 지점 중 가장 가까운 곳에서 출발한다
    costs, paths = nx.multi_source_dijkstra(walk, sources, cutoff=MAX_APPROACH_M * ROAD_COST_FACTOR, weight="cost")
    starts = []
    for node, cost in costs.items():
        entrance = min(vertices, key=lambda v: haversine_m(node, v))
        if haversine_m(node, entrance) <= radius:
            starts.append((cost, haversine_m(node, entrance), node, entrance))
    for cost, _, start, entrance in sorted(starts):
        path = list(reversed(paths[start]))
        edges = [walk[a][b] for a, b in zip(path, path[1:])]
        length = sum(edge["weight"] for edge in edges)
        if length > MAX_APPROACH_M:
            continue
        return {
            "park_id": park_id,
            "parking_way": f"https://www.openstreetmap.org/way/{parking_way_id}" if parking_way_id else None,
            "parking_way_version": version,
            "entrance": [round(entrance[0], 7), round(entrance[1], 7)],
            "entrance_to_start_m": round(haversine_m(entrance, start), 1),
            "length_m": round(length, 1),
            "road_m": round(sum(edge["weight"] for edge in edges if edge["road"]), 1),
            "way_ids": list(dict.fromkeys(edge["way_id"] for edge in edges)),
            "coordinates": [list(node) for node in path],
        }
    return None


def main():
    approaches = {}
    for parking_id, (park_id, way_id) in LOTS.items():
        approach = build_approach(park_id, parking_id, way_id)
        if approach is None:
            print(parking_id, f"공원 보행망까지 {MAX_APPROACH_M:.0f}m 안에 이어지는 길이 없습니다")
            continue
        approaches[parking_id] = approach
        print(parking_id, f"진입로 {approach['length_m']:.0f}m (도로 {approach['road_m']:.0f}m),",
              f"출입구→시작 {approach['entrance_to_start_m']:.0f}m, 출입구", approach["entrance"])
    document = {
        "source": "OpenStreetMap map API (highway=footway/path/pedestrian/cycleway/living_street, "
                  "residential/unclassified/service)",
        "retrieved_at": datetime.now(timezone.utc).date().isoformat(),
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "max_length_m": MAX_APPROACH_M,
        "approaches": approaches,
    }
    TARGET.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(approaches)}곳 → {TARGET.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
