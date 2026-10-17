"""[US-G1] 파일럿 거점 공영주차장 데이터 정합성 및 반경 검색 TDD 테스트.

검증 항목:
1. 픽스처(backend/fixtures/parking_lots_pilot.json): 형식, 중복, 지역 범위, 공원별 기상청 격자.
2. 검증기: 빠진 필드, 잘못된 형식, 중복 id, 범위 밖 좌표 등을 잡아내는지.
3. 읽기: 파일 오류를 ParkingDataError 로 통일하고 원본이 오염되지 않는지.
4. 반경 검색: 거리 계산, 정렬, 경계값, 입력 검증.
"""

import copy
import json
from collections import defaultdict

import pytest

from agent.route_geometry import haversine_m
from services.parking_lots import (
    ParkingDataError,
    find_nearby_parking_lots,
    load_pilot_parking_lots,
    lot_kma_grid,
    validate_parking_lots,
)

YURIM = (36.3628, 127.3592)  # 유림공원 부설 주차장 출입구


class TestFixtureData:
    def test_fixture_has_no_validation_problems(self):
        assert validate_parking_lots(load_pilot_parking_lots()) == []

    @staticmethod
    def _count_by_zone(status):
        counts = defaultdict(int)
        for lot in load_pilot_parking_lots():
            if lot["status"] == status:
                counts[lot["park_zone"]] += 1
        return dict(counts)

    def test_official_lots_per_zone(self):
        assert self._count_by_zone("official") == {"유림공원": 1, "송강근린공원": 2, "도안호수공원": 2, "세종호수공원": 1}

    def test_legacy_lots_per_zone(self):
        assert self._count_by_zone("legacy_unverified") == {"유림공원": 3, "송강근린공원": 2, "도안호수공원": 2, "세종호수공원": 4}

    def test_every_lot_records_its_source_and_verification_state(self):
        for lot in load_pilot_parking_lots():
            assert lot["source"].strip(), lot["parking_id"]
            assert isinstance(lot["verified"], bool), lot["parking_id"]
            assert lot["verified"] is (lot["status"] == "official"), lot["parking_id"]

    def test_legacy_lots_explain_what_is_wrong(self):
        for lot in load_pilot_parking_lots():
            if lot["status"] == "legacy_unverified":
                assert "공식" in lot["data_issue"], lot["parking_id"]

    def test_legacy_lots_of_one_park_share_one_weather_grid(self):
        """기존 항목은 같은 공원이면 같은 기상청 격자에 속한다."""
        grids = defaultdict(set)
        for lot in load_pilot_parking_lots():
            if lot["status"] == "legacy_unverified":
                grids[lot["park_zone"]].add(lot_kma_grid(lot))
        assert all(len(g) == 1 for g in grids.values()), dict(grids)

    def test_legacy_park_grids_match_adjacent_official_districts(self):
        """기존 항목의 격자는 공식 격자표의 인접 동과 일치 (원신흥동 67,100 / 구즉동 67,102 / 어진동 65,104 등)."""
        expected = {"유림공원": (67, 101), "송강근린공원": (67, 102),
                    "도안호수공원": (67, 100), "세종호수공원": (65, 104)}
        for lot in load_pilot_parking_lots():
            if lot["status"] == "legacy_unverified":
                assert lot_kma_grid(lot) == expected[lot["park_zone"]], lot["parking_id"]

    def test_official_lots_match_the_national_standard_data(self):
        """전국주차장정보표준데이터(기준일자 2026-04-16 전후)에서 확인한 값.

        도안동의 두 공식 주차장은 약 2.2km 떨어져 서로 다른 날씨 격자에 속한다 (67,99 / 67,100).
        """
        expected = {
            "유림공원주차장": (49, "free", (67, 101)),
            "송강동(프라자옆)공영": (86, "paid", (67, 102)),
            "송강동(GS마트앞)공영": (53, "paid", (67, 102)),
            "도안동 제5공한지유료주차장": (49, "paid", (67, 99)),
            "도안제2공한지무료주차장": (10, "free", (67, 100)),
            "어진동(C47)": (208, "free", (65, 104)),
        }
        official = {l["name"]: l for l in load_pilot_parking_lots() if l["status"] == "official"}
        assert set(official) == set(expected)
        for name, (capacity, fee_type, grid) in expected.items():
            lot = official[name]
            assert (lot["capacity"], lot["fee_type"], lot_kma_grid(lot)) == (capacity, fee_type, grid), name
            assert lot["is_public"] is True and lot["verified"] is True
            assert "15012896" in lot["source"] and lot["official_id"], name

    def test_official_lots_linked_to_their_park_by_name_or_within_300m_of_the_park_point(self):
        linked = {l["name"] for l in load_pilot_parking_lots() if l["park_link_verified"]}
        assert linked == {"유림공원주차장", "송강동(프라자옆)공영", "송강동(GS마트앞)공영"}

    def test_park_link_flag_agrees_with_the_distance_to_the_reference_park_point(self):
        import json
        from agent.route_geometry import haversine_m
        from services.parking_lots import DEFAULT_DATA_PATH
        reference = DEFAULT_DATA_PATH.parents[2] / "docs" / "reference" / "parks_gis" / "park_locations.geojson"
        points = {f["properties"]["name"]: f["geometry"]["coordinates"]
                  for f in json.loads(reference.read_text(encoding="utf-8"))["features"] if f["geometry"]}
        by_zone = {"송강근린공원": points["송강공원(송강동 근린공원)"], "도안호수공원": points["갑천생태호수공원(도안호수공원)"]}
        for lot in load_pilot_parking_lots():
            if lot["status"] == "official" and lot["park_zone"] in by_zone:
                near = haversine_m(by_zone[lot["park_zone"]], [lot["entrance_lon"], lot["entrance_lat"]]) <= 300
                assert lot["park_link_verified"] is near, lot["name"]


class TestValidator:
    @pytest.fixture
    def lots(self):
        return load_pilot_parking_lots()

    def test_missing_field_is_reported(self, lots):
        del lots[0]["capacity"]
        problems = validate_parking_lots(lots)
        assert any("capacity" in p and "없습니다" in p for p in problems)

    @pytest.mark.parametrize("field, bad", [
        ("entrance_lat", "36.3"), ("entrance_lat", float("nan")), ("entrance_lon", None),
        ("capacity", True), ("capacity", 10.5), ("is_public", "yes"), ("name", 123),
    ])
    def test_wrong_type_is_reported(self, lots, field, bad):
        lots[0][field] = bad
        assert any(field in p for p in validate_parking_lots(lots))

    def test_duplicate_id_is_reported(self, lots):
        lots[1]["parking_id"] = lots[0]["parking_id"]
        assert any("중복" in p for p in validate_parking_lots(lots))

    def test_unknown_fee_type_is_reported(self, lots):
        lots[0]["fee_type"] = "cheap"
        assert any("fee_type" in p for p in validate_parking_lots(lots))

    @pytest.mark.parametrize("capacity", [0, -5])
    def test_non_positive_capacity_is_reported(self, lots, capacity):
        lots[0]["capacity"] = capacity
        assert any("capacity" in p for p in validate_parking_lots(lots))

    @pytest.mark.parametrize("lat, lon", [(37.5665, 126.9780), (35.1, 129.0), (0.0, 0.0)],
                             ids=["서울", "부산", "0,0"])
    def test_coordinates_outside_region_are_reported(self, lots, lat, lon):
        lots[0]["entrance_lat"], lots[0]["entrance_lon"] = lat, lon
        assert any("범위 밖" in p for p in validate_parking_lots(lots))

    def test_unknown_status_is_reported(self, lots):
        lots[0]["status"] = "maybe"
        assert any("status" in p for p in validate_parking_lots(lots))

    def test_official_lot_must_be_verified_and_have_official_id(self, lots):
        official = next(l for l in lots if l["status"] == "official")
        official["verified"] = False
        del official["official_id"]
        problems = validate_parking_lots(lots)
        assert any("verified=true" in p for p in problems)
        assert any("official_id" in p for p in problems)

    def test_legacy_lot_must_be_unverified_and_explain_the_issue(self, lots):
        legacy = next(l for l in lots if l["status"] == "legacy_unverified")
        legacy["verified"] = True
        legacy["data_issue"] = "  "
        problems = validate_parking_lots(lots)
        assert any("verified=false" in p for p in problems)
        assert any("data_issue" in p for p in problems)

    @pytest.mark.parametrize("field", ["official_id", "parking_type", "data_issue"])
    def test_optional_field_with_wrong_type_is_reported(self, lots, field):
        lots[0][field] = 123
        assert any(field in p for p in validate_parking_lots(lots))

    def test_non_dict_item_is_reported_without_crashing(self):
        assert any("객체가 아닙니다" in p for p in validate_parking_lots(["not a dict"]))

    def test_several_problems_are_all_reported(self, lots):
        del lots[0]["name"]
        lots[1]["fee_type"] = "x"
        assert len(validate_parking_lots(lots)) >= 2


class TestLoader:
    def test_returns_independent_copies(self):
        first = load_pilot_parking_lots()
        total = len(first)
        first[0]["name"] = "변경됨"
        first.pop()
        again = load_pilot_parking_lots()
        assert again[0]["name"] != "변경됨" and len(again) == total

    def test_missing_file_raises_data_error(self, tmp_path):
        with pytest.raises(ParkingDataError):
            load_pilot_parking_lots(tmp_path / "none.json")

    @pytest.mark.parametrize("content", ["not json", "{}", '{"parking_lots": 5}', "[]"],
                             ids=["깨진 JSON", "키 없음", "목록 아님", "최상위가 목록"])
    def test_bad_structure_raises_data_error(self, tmp_path, content):
        path = tmp_path / "bad.json"
        path.write_text(content, encoding="utf-8")
        with pytest.raises(ParkingDataError):
            load_pilot_parking_lots(path)

    def test_custom_path_is_used(self, tmp_path):
        path = tmp_path / "one.json"
        path.write_text(json.dumps({"parking_lots": [{"parking_id": "x"}]}), encoding="utf-8")
        assert load_pilot_parking_lots(path) == [{"parking_id": "x"}]


class TestNearbySearch:
    def test_finds_yurim_lots_sorted_by_distance(self):
        result = find_nearby_parking_lots(*YURIM, radius_m=1500.0)
        assert {lot["park_zone"] for lot in result} == {"유림공원"}
        assert len(result) == 4  # 기존 3곳 + 공식 유림공원주차장
        distances = [lot["distance_m"] for lot in result]
        assert distances == sorted(distances)
        assert result[0]["parking_id"] == "pkg_yurim_01" and result[0]["distance_m"] == 0.0

    def test_verified_only_returns_official_lots(self):
        result = find_nearby_parking_lots(*YURIM, radius_m=1500.0, verified_only=True)
        assert [lot["name"] for lot in result] == ["유림공원주차장"]
        assert all(lot["verified"] for lot in result)

    def test_verified_only_changes_nothing_for_all_verified_lots(self):
        lots = [l for l in load_pilot_parking_lots() if l["verified"]]
        assert find_nearby_parking_lots(*YURIM, radius_m=10000.0, lots=lots, verified_only=True) == \
            find_nearby_parking_lots(*YURIM, radius_m=10000.0, lots=lots)

    def test_distance_matches_haversine(self):
        lots = load_pilot_parking_lots()
        result = find_nearby_parking_lots(36.3600, 127.3600, radius_m=5000.0, lots=lots)
        for item in result:
            expected = haversine_m([127.3600, 36.3600], [item["entrance_lon"], item["entrance_lat"]])
            assert item["distance_m"] == pytest.approx(expected, abs=0.1)

    def test_radius_is_inclusive_and_excludes_farther_lots(self):
        lot = {"parking_id": "a", "entrance_lat": 36.3628, "entrance_lon": 127.3592}
        distance = round(haversine_m([127.3600, 36.3600], [lot["entrance_lon"], lot["entrance_lat"]]), 1)
        assert len(find_nearby_parking_lots(36.3600, 127.3600, radius_m=distance, lots=[lot])) == 1
        assert find_nearby_parking_lots(36.3600, 127.3600, radius_m=distance - 0.2, lots=[lot]) == []

    def test_other_cities_are_out_of_range(self):
        assert find_nearby_parking_lots(37.5665, 126.9780, radius_m=1500.0) == []  # 서울시청

    def test_does_not_modify_source_data(self):
        lots = load_pilot_parking_lots()
        snapshot = copy.deepcopy(lots)
        find_nearby_parking_lots(*YURIM, lots=lots)
        assert lots == snapshot

    def test_larger_radius_reaches_other_parks(self):
        zones = {lot["park_zone"] for lot in find_nearby_parking_lots(*YURIM, radius_m=10000.0)}
        assert {"유림공원", "도안호수공원", "송강근린공원"} <= zones

    @pytest.mark.parametrize("lat, lon, radius", [
        (None, 127.3, 1500.0), (36.3, "127.3", 1500.0), (float("nan"), 127.3, 1500.0),
        (36.3, 127.3, 0.0), (36.3, 127.3, -1.0), (36.3, 127.3, float("inf")),
    ])
    def test_invalid_input_raises(self, lat, lon, radius):
        with pytest.raises(ValueError):
            find_nearby_parking_lots(lat, lon, radius_m=radius)
