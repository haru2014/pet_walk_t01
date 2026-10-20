"""대전·세종 파일럿 지역의 OSM 계단(highway=steps)을 받아 서버 파일로 저장한다 (공원 밖 경로 계단 수).

사용법 (저장소 루트 또는 backend 폴더에서):
    python backend/scripts/import_osm_steps.py              # Overpass 에서 새로 받기
    python backend/scripts/import_osm_steps.py 받은.json     # 이미 받은 Overpass JSON 으로 만들기
결과: backend/fixtures/osm_steps_pilot.json (© OpenStreetMap contributors, ODbL)
"""
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
TARGET = BACKEND_DIR / "fixtures" / "osm_steps_pilot.json"
# Copernicus DEM·토지피복 파일과 같은 파일럿 범위 (남, 서, 북, 동)
BBOX = (36.220, 127.170, 36.590, 127.470)
QUERY = f'[out:json][timeout:120];way["highway"="steps"]({",".join(map(str, BBOX))});out geom tags;'
MIRRORS = ("https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter")
KEEP_TAGS = ("highway", "incline", "step_count", "handrail", "ramp", "ramp:wheelchair", "ramp:stroller", "name")


def fetch() -> dict:
    data = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in MIRRORS:
        try:
            request = urllib.request.Request(url, data=data, headers={"User-Agent": "PetWalk-steps/1.0"})
            with urllib.request.urlopen(request, timeout=180) as response:
                return json.loads(response.read())
        except (OSError, ValueError) as exc:  # 서버 혼잡·오류 페이지는 다음 미러로
            last = exc
    raise RuntimeError(f"Overpass 를 받지 못했습니다: {last}")


def build(overpass: dict) -> dict:
    ways = []
    for element in overpass.get("elements", []):
        if element.get("type") != "way" or len(element.get("geometry") or []) < 2:
            continue
        tags = element.get("tags") or {}
        ways.append({
            "way_id": str(element["id"]),
            "coordinates": [[round(p["lon"], 7), round(p["lat"], 7)] for p in element["geometry"]],
            "tags": {k: tags[k] for k in KEEP_TAGS if k in tags},
        })
    ways.sort(key=lambda w: int(w["way_id"]))
    return {
        "source": "OpenStreetMap Overpass API, way[highway=steps]",
        "bbox_south_west_north_east": list(BBOX),
        "osm_base": (overpass.get("osm3s") or {}).get("timestamp_osm_base"),
        "retrieved_at": datetime.now(timezone.utc).date().isoformat(),
        "license": "ODbL-1.0",
        "attribution": "© OpenStreetMap contributors",
        "ways": ways,
    }


def main() -> None:
    overpass = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")) if len(sys.argv) > 1 else fetch()
    document = build(overpass)
    TARGET.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"계단 {len(document['ways'])}개 → {TARGET.relative_to(BACKEND_DIR.parent)}")


if __name__ == "__main__":
    main()
