"""[US-G1] 파일럿 거점 공영주차장 데이터 읽기·검증·반경 검색.

데이터는 backend/fixtures/parking_lots_pilot.json 한 곳에 둔다.
각 항목의 verified 가 False 이면 공식 자료(전국주차장정보표준데이터 등)와 대조하지 않은 값이다.

좌표 순서: 데이터와 함수 인자는 (위도, 경도), agent.route_geometry 는 [경도, 위도] 이다.
"""

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from agent.route_geometry import haversine_m
from services.kma_grid_converter import latlon_to_grid

DEFAULT_DATA_PATH = Path(__file__).resolve().parents[1] / "fixtures" / "parking_lots_pilot.json"

REQUIRED_FIELDS = {
    "parking_id": str, "name": str, "park_zone": str, "entrance_lat": float, "entrance_lon": float,
    "is_public": bool, "fee_type": str, "fee_info": str, "capacity": int, "address": str,
    "source": str, "verified": bool, "status": str, "park_link_verified": bool, "park_link_basis": str,
}
OPTIONAL_FIELDS = {"official_id": str, "parking_type": str, "data_issue": str, "coordinate_basis": str}
# official: 공식 표준데이터에서 가져온 값 / legacy_unverified: 기존 데이터(공식 자료와 대조 전 또는 불일치)
# park_operator: 공원 관리기관 공식 안내(누리집)에서 확인한 공원 주차장. 표준데이터에 없어 좌표는 따로 구하므로
#                coordinate_basis 에 좌표를 구한 방법을 적는다.
STATUSES = {"official", "legacy_unverified", "park_operator"}
FEE_TYPES = {"free", "paid"}
# 대전·세종을 넉넉히 포함하는 범위 (좌표가 엉뚱한 지역으로 들어가는 실수를 막는 용도)
REGION_LAT_RANGE = (36.1, 36.8)
REGION_LON_RANGE = (126.9, 127.6)
DEFAULT_RADIUS_M = 1500.0


class ParkingDataError(Exception):
    """주차장 데이터 파일을 읽을 수 없거나 형식이 잘못된 경우."""


def load_pilot_parking_lots(path: Optional[Path] = None) -> List[Dict[str, Any]]:
    """JSON 파일에서 주차장 목록을 읽는다 (호출마다 새 복사본 반환)."""
    target = Path(path) if path else DEFAULT_DATA_PATH
    try:
        document = json.loads(target.read_text(encoding="utf-8"))
        lots = document["parking_lots"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise ParkingDataError(f"주차장 데이터를 읽을 수 없습니다: {target.name} ({type(exc).__name__})") from None
    if not isinstance(lots, list):
        raise ParkingDataError("parking_lots 는 목록이어야 합니다")
    return [dict(lot) for lot in lots]


def _type_ok(value: Any, expected: type) -> bool:
    if expected is float:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    if expected is int:
        return isinstance(value, int) and not isinstance(value, bool)
    return isinstance(value, expected)


def _check_official_status(label: str, lot: Dict[str, Any]) -> List[str]:
    problems = []
    if lot.get("verified") is not True:
        problems.append(f"{label}: 공식 항목은 verified=true 여야 합니다")
    if not str(lot.get("official_id") or "").strip():
        problems.append(f"{label}: 공식 항목은 official_id 가 있어야 합니다")
    return problems


def _check_park_operator_status(label: str, lot: Dict[str, Any]) -> List[str]:
    problems = []
    if lot.get("verified") is not True:
        problems.append(f"{label}: 공원 관리기관 항목은 verified=true 여야 합니다")
    if not str(lot.get("coordinate_basis") or "").strip():
        problems.append(f"{label}: 공원 관리기관 항목은 coordinate_basis 에 좌표를 구한 방법을 적어야 합니다")
    return problems


def _check_unverified_status(label: str, lot: Dict[str, Any]) -> List[str]:
    problems = []
    if lot.get("verified") is not False:
        problems.append(f"{label}: 기존(미검증) 항목은 verified=false 여야 합니다")
    if not str(lot.get("data_issue") or "").strip():
        problems.append(f"{label}: 기존(미검증) 항목은 data_issue 에 확인된 문제를 적어야 합니다")
    return problems


_STATUS_CHECKERS = {
    "official": _check_official_status,
    "park_operator": _check_park_operator_status,
    "legacy_unverified": _check_unverified_status,
}


def _status_problems(label: str, lot: Dict[str, Any]) -> List[str]:
    """status 와 verified/official_id/data_issue 의 앞뒤가 맞는지 검사한다."""
    status = lot.get("status")
    if status is None:
        return []  # 필수 필드 누락은 별도로 보고된다
    checker = _STATUS_CHECKERS.get(status)
    if checker is None:
        return [f"{label}: status 는 {sorted(STATUSES)} 중 하나여야 합니다 ({status!r})"]
    return checker(label, lot)


def _validate_lot_field_types(label: str, lot: Dict[str, Any]) -> List[str]:
    """필수 및 선택 필드의 존재 및 타입 정합성을 검사한다."""
    problems: List[str] = []
    for field, expected in REQUIRED_FIELDS.items():
        if field not in lot:
            problems.append(f"{label}: 필드 '{field}' 가 없습니다")
        elif not _type_ok(lot[field], expected):
            problems.append(f"{label}: 필드 '{field}' 의 형식이 잘못되었습니다 ({lot[field]!r})")
    for field, expected in OPTIONAL_FIELDS.items():
        if field in lot and not _type_ok(lot[field], expected):
            problems.append(f"{label}: 필드 '{field}' 의 형식이 잘못되었습니다 ({lot[field]!r})")
    return problems


def _validate_lot_semantics(label: str, lot: Dict[str, Any], seen_ids: set) -> List[str]:
    """주차장 ID 중복, 요금 유형, 수용량, 좌표 범위 등을 검사한다."""
    problems: List[str] = []
    pid = lot.get("parking_id")
    if pid in seen_ids:
        problems.append(f"{label}: parking_id 가 중복입니다")
    seen_ids.add(pid)

    if lot.get("fee_type") not in FEE_TYPES:
        problems.append(f"{label}: fee_type 은 {sorted(FEE_TYPES)} 중 하나여야 합니다 ({lot.get('fee_type')!r})")
    if _type_ok(lot.get("capacity"), int) and lot["capacity"] <= 0:
        problems.append(f"{label}: capacity 는 1 이상이어야 합니다")

    lat, lon = lot.get("entrance_lat"), lot.get("entrance_lon")
    if _type_ok(lat, float) and _type_ok(lon, float):
        if not (REGION_LAT_RANGE[0] <= lat <= REGION_LAT_RANGE[1]
                and REGION_LON_RANGE[0] <= lon <= REGION_LON_RANGE[1]):
            problems.append(f"{label}: 좌표({lat}, {lon})가 대전·세종 범위 밖입니다")
    return problems


def validate_parking_lots(lots: List[Dict[str, Any]]) -> List[str]:
    """데이터의 문제점을 사람이 읽을 수 있는 문장 목록으로 돌려준다. 문제가 없으면 빈 목록."""
    problems: List[str] = []
    seen_ids: set = set()
    for index, lot in enumerate(lots):
        label = lot.get("parking_id") if isinstance(lot, dict) else None
        label = label or f"#{index}"
        if not isinstance(lot, dict):
            problems.append(f"{label}: 항목이 객체가 아닙니다")
            continue
        problems.extend(_validate_lot_field_types(label, lot))
        problems.extend(_status_problems(label, lot))
        problems.extend(_validate_lot_semantics(label, lot, seen_ids))
    return problems


def lot_kma_grid(lot: Dict[str, Any]) -> Tuple[int, int]:
    """주차장 출입구가 속한 기상청 격자 (nx, ny). 날씨 조회에 쓴다."""
    return latlon_to_grid(lat=lot["entrance_lat"], lon=lot["entrance_lon"])


def find_nearby_parking_lots(lat: float, lon: float, radius_m: float = DEFAULT_RADIUS_M,
                             lots: Optional[List[Dict[str, Any]]] = None,
                             verified_only: bool = False) -> List[Dict[str, Any]]:
    """(lat, lon) 에서 radius_m 이내 주차장을 가까운 순으로 돌려준다 (distance_m 추가, 원본은 바꾸지 않음).

    verified_only=True 이면 공식 자료로 확인된(verified=true) 주차장만 포함한다.
    """
    for name, value in (("lat", lat), ("lon", lon), ("radius_m", radius_m)):
        if not _type_ok(value, float):
            raise ValueError(f"{name} 는 유한한 숫자여야 합니다: {value!r}")
    if radius_m <= 0:
        raise ValueError(f"radius_m 는 0 보다 커야 합니다: {radius_m}")
    candidates = load_pilot_parking_lots() if lots is None else lots
    nearby = []
    for lot in candidates:
        if verified_only and lot.get("verified") is not True:
            continue
        distance = round(haversine_m([lon, lat], [lot["entrance_lon"], lot["entrance_lat"]]), 1)
        if distance <= radius_m:
            nearby.append({**lot, "distance_m": distance})
    nearby.sort(key=lambda item: item["distance_m"])
    return nearby
