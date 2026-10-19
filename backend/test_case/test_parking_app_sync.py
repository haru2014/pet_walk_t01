"""[US-G1] 앱 오프라인 주차장 목록이 서버 원본과 같은지 검사한다 (#143).

실패하면 backend/fixtures/parking_lots_pilot.json 을 고친 뒤
`python backend/scripts/export_parking_for_app.py` 를 실행해 앱 파일을 다시 만든다.
"""

import importlib.util
import json
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("export_parking_for_app",
                                               BACKEND_DIR / "scripts" / "export_parking_for_app.py")
export = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(export)


def test_app_offline_list_matches_the_server_fixture():
    expected = export.render(export.build_app_document(json.loads(export.SOURCE.read_text(encoding="utf-8"))))
    assert export.TARGET.exists(), "앱 파일이 없습니다: python backend/scripts/export_parking_for_app.py"
    assert export.TARGET.read_text(encoding="utf-8") == expected, (
        "앱 오프라인 주차장 목록이 서버 원본과 다릅니다: python backend/scripts/export_parking_for_app.py 를 실행하세요")


def test_app_list_keeps_only_fields_the_app_type_declares():
    document = json.loads(export.TARGET.read_text(encoding="utf-8"))
    for lot in document["parking_lots"]:
        assert set(lot) <= set(export.APP_FIELDS), lot["parking_id"]
        assert "coordinate_basis" not in lot  # 근거 설명은 서버 원본에만 둔다
