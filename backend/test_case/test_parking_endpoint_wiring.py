"""[US-G1] /api/v1/parking/nearby 가 fixtures/parking_lots_pilot.json 을 쓰는지 검증한다."""

import pytest
from fastapi.testclient import TestClient

import main
from services.parking_lots import load_pilot_parking_lots

_YURIM = {"lat": 36.3610, "lon": 127.3577}


@pytest.fixture(scope="module")
def client() -> TestClient:
    return TestClient(main.app)


def test_server_list_is_the_json_file_not_a_hardcoded_copy():
    assert main._PILOT_PARKING_LOTS == load_pilot_parking_lots()
    assert {lot["parking_id"] for lot in main._PILOT_PARKING_LOTS} >= {"std_186-1-000005", "pkg_yurim_01"}


def test_nearby_returns_official_lots_with_verification_fields(client):
    lots = client.get("/api/v1/parking/nearby", params={**_YURIM, "radius_m": 1500}).json()["parking_lots"]
    official = next(lot for lot in lots if lot["parking_id"] == "std_186-1-000005")
    assert official["verified"] is True and official["status"] == "official" and official["capacity"] == 49
    legacy = next(lot for lot in lots if lot["parking_id"] == "pkg_yurim_01")
    assert legacy["verified"] is False and "data_issue" in legacy
    assert [lot["distance_m"] for lot in lots] == sorted(lot["distance_m"] for lot in lots)


def test_verified_only_hides_unverified_lots(client):
    lots = client.get("/api/v1/parking/nearby", params={**_YURIM, "radius_m": 1500, "verified_only": "true"}).json()["parking_lots"]
    assert lots and all(lot["verified"] is True for lot in lots)
    assert {lot["parking_id"] for lot in lots} == {"std_186-1-000005"}

