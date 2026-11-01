"""서버 주차장 데이터(원본)에서 앱 오프라인 목록 JSON 을 만든다 (#143).

원본은 backend/fixtures/parking_lots_pilot.json 하나다. 앱의 frontend/src/data/parkingLotsPilot.json 은
이 스크립트로만 만든다(손으로 고치지 않는다). 두 파일이 어긋나면 test_parking_app_sync.py 가 실패한다.

사용법 (저장소 루트 또는 backend 폴더에서):
    python backend/scripts/export_parking_for_app.py
"""
import json
from pathlib import Path
from typing import Any, Dict, List

BACKEND_DIR = Path(__file__).resolve().parents[1]
SOURCE = BACKEND_DIR / "fixtures" / "parking_lots_pilot.json"
TARGET = BACKEND_DIR.parent / "frontend" / "src" / "data" / "parkingLotsPilot.json"

# 앱 타입 ParkingLotDTO(frontend/src/types/parking.ts)에 있는 칸만 내보낸다 (distance_m 은 앱이 계산)
APP_FIELDS = (
    "parking_id", "name", "entrance_lat", "entrance_lon", "is_public", "fee_type", "fee_info", "capacity",
    "park_zone", "address", "verified", "status", "official_id", "data_issue", "source", "park_link_verified",
)


def build_app_document(source: Dict[str, Any]) -> Dict[str, Any]:
    lots: List[Dict[str, Any]] = [
        {field: lot[field] for field in APP_FIELDS if field in lot} for lot in source["parking_lots"]
    ]
    return {
        "_generated": ("backend/fixtures/parking_lots_pilot.json 에서 backend/scripts/export_parking_for_app.py 로 "
                       "만든 파일입니다. 직접 고치지 말고 원본을 고친 뒤 스크립트를 다시 실행하세요."),
        "parking_lots": lots,
    }


def render(document: Dict[str, Any]) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2) + "\n"


def main() -> None:
    document = build_app_document(json.loads(SOURCE.read_text(encoding="utf-8")))
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(render(document), encoding="utf-8")
    print(f"{len(document['parking_lots'])}곳 → {TARGET.relative_to(BACKEND_DIR.parent)}")


if __name__ == "__main__":
    main()
