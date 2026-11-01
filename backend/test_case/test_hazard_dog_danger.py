"""위험 제보 종류 '들개·맹견(dog_danger)' (#227). 앱이 그대로 보낸다(#228).

예전에는 서버 HazardType 에 없어 제보·우회 요청이 422 로 거절됐다.
"""
from pathlib import Path

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
SQL_DIR = Path(__file__).resolve().parents[1] / "sql"


def test_dog_danger_report_is_accepted():
    res = client.post("/api/v1/hazards", json={
        "user_id": "test", "lat": 36.36, "lon": 127.36, "hazard_type": "dog_danger",
        "severity": "danger", "description": "현장 돌발 위험 [들개/맹견 출몰] 사용자 제보"})
    assert res.status_code == 201, res.text


def test_dog_danger_reroute_avoids_the_spot():
    res = client.post("/api/v1/walk/reroute", json={
        "current_lat": 36.36, "current_lon": 127.36, "destination_lat": 36.37, "destination_lon": 127.37,
        "hazard_lat": 36.365, "hazard_lon": 127.365, "hazard_type": "dog_danger", "severity": "danger",
        "confidence": 0.9})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["needs_reroute"] is True
    assert "들개·맹견" in data["voice_alert"]


def test_database_allows_dog_danger():
    """운영 DB(Supabase) 의 종류 제한(CHECK)도 dog_danger 를 받아야 DB 에 저장된다."""
    assert "'dog_danger'" in (SQL_DIR / "supabase_schema.sql").read_text(encoding="utf-8")
    migration = (SQL_DIR / "supabase_hazard_dog_danger_migration.sql").read_text(encoding="utf-8")
    assert "hazard_reports_hazard_type_check" in migration and "'dog_danger'" in migration
