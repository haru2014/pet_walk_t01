"""[편안하개 - PetWalk / 3번 노희선 서버]
현장 위험(Hazard) 도메인 서비스: 우회 재탐색, 비전 판독 입구, 위험 제보 저장소.

- US-D2: 위험 좌표를 임시 장애물로 등록하고 3초 이내 안전 우회 경로 재산출
- US-D1 입구: 사진 업로드를 받아 비전 체인(2번 담당)에 넘기기 전 서버 측 계약 고정.
           GEMINI_API_KEY 미설정 시 mock 모드로 결정적(deterministic) 결과 반환
- hazard_reports: Supabase 테이블 적재, 미연결 시 인메모리 폴백 (community_repo 와 동일 전략)
"""

from __future__ import annotations

import logging
import math
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from test_case.test_api_contracts import calculate_haversine_distance_m
from test_case.test_vision_safety_inspector import (
    HazardInspectionResult,
    HazardSeverity,
    HazardType,
    ParkBoardInspectionResult,
    evaluate_hazard_action,
    process_park_board_constraints,
)

logger = logging.getLogger("petwalk.hazard")

InspectType = Literal["hazard", "park_board"]


# ==========================================
# DTO
# ==========================================

class RerouteRequest(BaseModel):
    """POST /api/v1/walk/reroute 요청."""
    current_lat: float = Field(..., ge=-90.0, le=90.0)
    current_lon: float = Field(..., ge=-180.0, le=180.0)
    destination_lat: float = Field(..., ge=-90.0, le=90.0)
    destination_lon: float = Field(..., ge=-180.0, le=180.0)
    hazard_lat: Optional[float] = Field(None, ge=-90.0, le=90.0)
    hazard_lon: Optional[float] = Field(None, ge=-180.0, le=180.0)
    hazard_type: Optional[HazardType] = "high_curb"
    severity: Optional[HazardSeverity] = "warning"
    confidence: float = Field(0.9, ge=0.0, le=1.0)
    # 현재 안내 중인 경로 좌표열 [[lon, lat], ...]. 없으면 현재 위치→목적지 직선을 기준으로 함.
    route_coordinates: Optional[List[List[float]]] = None
    reroute_reason: Optional[str] = "hazard"
    # 경로 이탈 직전까지 코스 위에서 진행한 거리(m). 순환 코스에서 앞쪽 합류 지점을 고르는 데 사용.
    progress_m: Optional[float] = Field(None, ge=0.0)


class HazardReportRequest(BaseModel):
    """POST /api/v1/hazards 요청."""
    user_id: str = Field(..., min_length=1)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lon: float = Field(..., ge=-180.0, le=180.0)
    hazard_type: HazardType
    severity: HazardSeverity
    description: str = Field(..., min_length=5, max_length=300)
    photo_url: Optional[str] = None


# ==========================================
# US-D2: 우회 재탐색
# ==========================================

_HAZARD_LABEL_KO = {
    "high_curb": "높은 턱",
    "stairs": "야외 계단",
    "construction": "공사",
    "broken_glass": "유리 파편",
    "dog_danger": "들개·맹견",
}
_HAZARD_CLEARANCE_M = 60.0   # 이 거리 안의 기존 경로점은 제거
_DETOUR_OFFSET_M = 80.0      # 위험점에서 수직으로 비켜갈 거리


def _offset_point(lat: float, lon: float, bearing_rad: float, dist_m: float) -> List[float]:
    """위경도 점을 방위각/거리만큼 평면 근사 이동. 반환 [lon, lat]."""
    dlat = (dist_m * math.cos(bearing_rad)) / 111_000.0
    dlon = (dist_m * math.sin(bearing_rad)) / (111_000.0 * math.cos(math.radians(lat)))
    return [round(lon + dlon, 6), round(lat + dlat, 6)]


def _polyline_length_m(coords: List[List[float]]) -> float:
    total = 0.0
    for a, b in zip(coords, coords[1:]):
        total += calculate_haversine_distance_m((a[1], a[0]), (b[1], b[0]))
    return round(total, 1)


def build_detour_route(req: RerouteRequest) -> Dict[str, Any]:
    """위험 좌표 반경 내 경로점을 제거하고, 수직 방향 우회점을 삽입한 LineString 좌표열 생성.

    실제 OSRM/ORS 재호출은 후속 작업. 지금은 기하학적 우회로를 만들어 API 계약을 고정한다.
    """
    start = [req.current_lon, req.current_lat]
    end = [req.destination_lon, req.destination_lat]
    base = req.route_coordinates or [start, end]
    if base[0] != start:
        base = [start] + base
    if base[-1] != end:
        base = base + [end]

    hazard = (req.hazard_lat, req.hazard_lon)
    kept = [pt for pt in base if calculate_haversine_distance_m(hazard, (pt[1], pt[0])) > _HAZARD_CLEARANCE_M]
    if kept[0] != start:
        kept.insert(0, start)
    if kept[-1] != end:
        kept.append(end)

    # 진행 방향(현재→목적지)에 수직인 방위각으로 우회점 1개 삽입
    heading = math.atan2(
        (end[0] - start[0]) * math.cos(math.radians(req.current_lat)),
        (end[1] - start[1]),
    )
    detour = _offset_point(req.hazard_lat, req.hazard_lon, heading + math.pi / 2, _DETOUR_OFFSET_M)

    # 위험점에 가장 가까운 두 점 사이에 우회점 삽입
    insert_at = 1
    best = float("inf")
    for i in range(len(kept) - 1):
        mid = ((kept[i][1] + kept[i + 1][1]) / 2, (kept[i][0] + kept[i + 1][0]) / 2)
        d = calculate_haversine_distance_m(hazard, mid)
        if d < best:
            best, insert_at = d, i + 1
    coords = kept[:insert_at] + [detour] + kept[insert_at:]

    clearance = min(calculate_haversine_distance_m(hazard, (pt[1], pt[0])) for pt in coords[1:-1]) if len(coords) > 2 else 0.0
    return {
        "coordinates": coords,
        "distance_m": _polyline_length_m(coords),
        "hazard_clearance_m": round(clearance, 1),
    }


_REJOIN_BACKTRACK_TOLERANCE_M = 30.0   # 진행 거리보다 이만큼 뒤쪽 후보까지는 전방으로 취급
_REJOIN_FORWARD_SLACK_M = 60.0         # 전방 후보가 전체 최근접보다 이만큼 이상 멀면 최근접 사용
_REJOIN_SAME_PLACE_M = 15.0            # 같은 자리(여러 바퀴)로 볼 거리


def _collect_projections(coords: List[List[float]], lat: float, lon: float) -> List[Dict[str, Any]]:
    """현재 위치를 코스의 모든 선분에 투영한 후보 [{point, next_index, progress_m, distance_m}]."""
    cos_lat = math.cos(math.radians(lat))
    candidates: List[Dict[str, Any]] = []
    traversed = 0.0
    for index in range(1, len(coords)):
        a, b = coords[index - 1], coords[index]
        ax, ay = (a[0] - lon) * 111_320.0 * cos_lat, (a[1] - lat) * 110_540.0
        bx, by = (b[0] - lon) * 111_320.0 * cos_lat, (b[1] - lat) * 110_540.0
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        ratio = 0.0 if length_sq == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / length_sq))
        segment_m = calculate_haversine_distance_m((a[1], a[0]), (b[1], b[0]))
        candidates.append({
            "point": [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio],
            "next_index": index,
            "progress_m": traversed + ratio * segment_m,
            "distance_m": math.hypot(ax + ratio * dx, ay + ratio * dy),
        })
        traversed += segment_m
    return candidates


def _select_projection(candidates: List[Dict[str, Any]], progress_m: Optional[float]) -> Optional[Dict[str, Any]]:
    """합류 지점 선택. 진행 거리 힌트가 있으면 지금까지 온 곳보다 앞쪽에서 가장 가까운 지점을 우선."""
    if not candidates:
        return None
    nearest = min(candidates, key=lambda c: c["distance_m"])
    if progress_m is None:
        return nearest
    forward = [c for c in candidates if c["progress_m"] >= progress_m - _REJOIN_BACKTRACK_TOLERANCE_M]
    if not forward:
        return nearest
    nearest_forward = min(forward, key=lambda c: c["distance_m"])
    if nearest_forward["distance_m"] > nearest["distance_m"] + _REJOIN_FORWARD_SLACK_M:
        return nearest
    same_place = [c for c in forward if c["distance_m"] <= nearest_forward["distance_m"] + _REJOIN_SAME_PLACE_M]
    return min(same_place, key=lambda c: c["progress_m"])


def build_deviation_route(req: RerouteRequest) -> Dict[str, Any]:
    """경로 이탈 시 현재 위치에서 기존 코스 선분으로 합류한 뒤 남은 코스를 이어 가는 경로 생성.

    정점이 아닌 선분 투영으로 합류하고, 순환 코스는 progress_m 보다 앞쪽에서 이어 시작점 복귀만 안내하지 않는다.
    """
    start = [req.current_lon, req.current_lat]
    end = [req.destination_lon, req.destination_lat]
    base = req.route_coordinates or [start, end]
    if base[-1] != end:
        base = base + [end]

    join = _select_projection(_collect_projections(base, req.current_lat, req.current_lon), req.progress_m)
    if join is None:
        coords = [start, end]
    else:
        rest = [list(pt) for pt in base[join["next_index"]:]]
        # 투영점이 다음 정점과 사실상 같으면 중복 점을 만들지 않는다.
        if rest and calculate_haversine_distance_m(
            (join["point"][1], join["point"][0]), (rest[0][1], rest[0][0])
        ) < 1.0:
            rest.pop(0)
        coords = [start, list(join["point"])] + rest

    return {
        "coordinates": coords,
        "distance_m": _polyline_length_m(coords),
        "hazard_clearance_m": 0.0,
    }


def reroute_around_hazard(req: RerouteRequest) -> Dict[str, Any]:
    """[US-D2] 위험 판정 또는 경로 이탈 시 안전 우회/복귀 경로 재산출. 응답에 측정 지연시간 포함."""
    started = time.perf_counter()

    # 경로 이탈(deviation) 또는 위험 좌표 미지정 시 즉시 복귀 재탐색 처리
    if req.reroute_reason == "deviation" or req.hazard_lat is None or req.hazard_lon is None:
        detour = build_deviation_route(req)
        return {
            "status": "REROUTED",
            "needs_reroute": True,
            "penalty_multiplier": 1.0,
            "voice_alert": "경로를 재탐색했습니다. 안전한 새 경로로 안내합니다.",
            "blocked_hazard": None,
            "geojson": {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"segmentType": "reroute", "reason": "deviation"},
                        "geometry": {"type": "LineString", "coordinates": detour["coordinates"]},
                    }
                ],
            },
            "new_distance_m": detour["distance_m"],
            "hazard_clearance_m": None,
            "latency_seconds": round(time.perf_counter() - started, 3),
        }

    inspection = HazardInspectionResult(
        hazard_type=req.hazard_type,
        severity=req.severity,
        description=f"{req.hazard_type} 현장 감지 ({req.severity})",
        recommended_action="reroute" if req.severity != "info" else "proceed_with_caution",
        confidence=req.confidence,
    )
    action = evaluate_hazard_action(inspection)

    if not action["needs_reroute"]:
        return {
            "status": "KEEP_ROUTE",
            "needs_reroute": False,
            "penalty_multiplier": action["penalty_multiplier"],
            "voice_alert": action.get("voice_alert") or action.get("message"),
            "blocked_hazard": None,
            "geojson": None,
            "new_distance_m": None,
            "hazard_clearance_m": None,
            "latency_seconds": round(time.perf_counter() - started, 3),
        }

    detour = build_detour_route(req)
    label = _HAZARD_LABEL_KO.get(req.hazard_type, "위험")
    return {
        "status": "REROUTED",
        "needs_reroute": True,
        "penalty_multiplier": action["penalty_multiplier"],
        "voice_alert": f"전방 {label} 구간을 우회하여 새로운 경로를 안내합니다.",
        "blocked_hazard": {
            "lat": req.hazard_lat,
            "lon": req.hazard_lon,
            "hazard_type": req.hazard_type,
            "severity": req.severity,
            "blocked_radius_m": _HAZARD_CLEARANCE_M,
        },
        "geojson": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"segmentType": "reroute", "avoids": req.hazard_type},
                    "geometry": {"type": "LineString", "coordinates": detour["coordinates"]},
                }
            ],
        },
        "new_distance_m": detour["distance_m"],
        "hazard_clearance_m": detour["hazard_clearance_m"],
        "latency_seconds": round(time.perf_counter() - started, 3),
    }


# ==========================================
# US-D1 입구: 비전 판독 (mock 모드 + 라이브 훅)
# ==========================================

def vision_available() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


def _mock_hazard_result(filename: str) -> HazardInspectionResult:
    """GEMINI 미연결 시 파일명 힌트로 결정적 결과 생성 (프론트 연동/데모용)."""
    name = (filename or "").lower()
    if "stair" in name or "계단" in name:
        return HazardInspectionResult(
            hazard_type="stairs", severity="danger", description="전방 야외 계단이 감지되었습니다.",
            recommended_action="reroute", confidence=0.91,
        )
    if "curb" in name or "턱" in name:
        return HazardInspectionResult(
            hazard_type="high_curb", severity="warning", curb_height_cm=18.0,
            description="약 18cm 높은 턱이 감지되었습니다.", recommended_action="reroute", confidence=0.87,
        )
    if "construction" in name or "공사" in name:
        return HazardInspectionResult(
            hazard_type="construction", severity="danger", description="공사 자재 및 임시 울타리가 감지되었습니다.",
            recommended_action="reroute", confidence=0.89,
        )
    return HazardInspectionResult(
        hazard_type="none", severity="info", description="특이 위험 요소가 감지되지 않았습니다.",
        recommended_action="safe", confidence=0.80,
    )


def _mock_park_board_result() -> ParkBoardInspectionResult:
    return ParkBoardInspectionResult(
        park_name="샘플 근린공원",
        has_dirt_trail=True,
        has_grass_zone=True,
        dog_restricted_zones=["어린이 놀이터"],
        detected_surfaces=["dirt", "grass", "paved"],
        confidence_score=0.82,
        summary_comment="둘레길에 비포장 흙길이 있으며 놀이터 구역은 반려견 출입이 제한됩니다.",
        requires_recapture=False,
    )


def run_vision_inspection(image_bytes: bytes, filename: str, inspect_type: InspectType) -> Dict[str, Any]:
    """비전 판독 진입점.

    라이브(GEMINI_API_KEY 설정) 구현은 2번 데이터 담당의 Gemini 캐스케이드 체인이 이 함수에 연결된다.
    현재는 mock 결과를 돌려 API 계약을 고정한다.
    """
    logger.debug("비전 판독 요청 수신: filename=%s, byte_size=%d", filename, len(image_bytes))
    live = vision_available()
    if inspect_type == "park_board":
        result = _mock_park_board_result()
        return {
            "inspect_type": inspect_type,
            "is_live_vision": False,  # 참고(2번 데이터): Gemini 라이브 체인 연결 시 True로 전환
            "model": "mock" if not live else "gemini-chain-pending",
            "result": result.model_dump(),
            "routing_constraints": process_park_board_constraints(result),
        }

    result = _mock_hazard_result(filename)
    return {
        "inspect_type": inspect_type,
        "is_live_vision": False,
        "model": "mock" if not live else "gemini-chain-pending",
        "result": result.model_dump(),
        "routing_action": evaluate_hazard_action(result),
    }


# ==========================================
# hazard_reports 저장소 (Supabase / 인메모리 폴백)
# ==========================================

_memory_reports: List[Dict[str, Any]] = []


class HazardReportRepository:
    """community_repo 와 같은 Supabase 클라이언트를 공유하되 hazard_reports 테이블을 다룬다."""

    def __init__(self, client_provider):
        self._client_provider = client_provider  # callable → supabase client or None

    @property
    def _client(self):
        return self._client_provider()

    def is_connected(self) -> bool:
        return self._client is not None

    def save(self, req: HazardReportRequest) -> Dict[str, Any]:
        report = {
            "report_id": f"hz_{int(time.time() * 1000)}_{len(_memory_reports) + 1}",
            "user_id": req.user_id,
            "lat": req.lat,
            "lon": req.lon,
            "hazard_type": req.hazard_type,
            "severity": req.severity,
            "description": req.description,
            "photo_url": req.photo_url,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_active": True,
        }
        client = self._client
        if client:
            try:
                res = client.table("hazard_reports").insert(report).execute()
                if res and res.data:
                    report = res.data[0]
            except Exception as e:  # 네트워크/스키마 오류 시 로컬 폴백
                logger.warning(f"[Supabase] hazard_reports 저장 실패, 인메모리 폴백: {e}")
        _memory_reports.insert(0, report)
        return report

    def nearby(self, lat: float, lon: float, radius_m: float, limit: int = 50) -> List[Dict[str, Any]]:
        source: List[Dict[str, Any]] = list(_memory_reports)
        client = self._client
        if client:
            try:
                res = client.table("hazard_reports").select("*").eq("is_active", True).limit(500).execute()
                if res and res.data:
                    source = res.data
            except Exception as e:
                logger.warning(f"[Supabase] hazard_reports 조회 실패, 인메모리 폴백: {e}")

        out = []
        for r in source:
            d = calculate_haversine_distance_m((lat, lon), (r["lat"], r["lon"]))
            if d <= radius_m:
                out.append({**r, "distance_m": d})
        out.sort(key=lambda r: r["distance_m"])
        return out[:limit]
