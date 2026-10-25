"""[편안하개 - PetWalk] 산책 기록 공개(후기 공유) — 서버 마스킹 후 공개 (이슈 #116, US-G2).

산책 기록의 실제 경로(route_coords)는 본인만 볼 수 있다. 후기를 공개할 때는 이 서버가
출발·도착 200m 를 잘라낸(apply_spatial_masking_to_course) 좌표만 public_route_coords 에 저장한다.
앱은 is_public / public_route_coords 를 DB 에 직접 쓰지 못한다(backend/sql/supabase_walk_public_migration.sql).

로그에는 좌표를 남기지 않는다. (기록 id·개수만)
"""

import logging
import math
from typing import Any, Dict, List, Optional

from agent.spatial_masking import apply_spatial_masking_to_course

logger = logging.getLogger("petwalk.walk_share")

MASKING_RADIUS_M = 200.0
MIN_ROUTE_POINTS = 4


class WalkShareError(Exception):
    """공개 처리 실패. status 는 HTTP 상태 코드, code 는 앱이 처리할 수 있는 고정 오류 코드."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def verify_user(client: Any, token: Optional[str]) -> str:
    """Supabase 로그인 토큰(JWT)을 확인하고 사용자 id 를 돌려준다."""
    if not token or not token.strip():
        raise WalkShareError(401, "AUTH_REQUIRED", "로그인이 필요합니다.")
    try:
        res = client.auth.get_user(token.strip())
        user_id = getattr(getattr(res, "user", None), "id", None)
    except Exception:  # supabase 가 토큰 거절 시 예외를 던진다
        user_id = None
    if not user_id:
        raise WalkShareError(401, "AUTH_INVALID", "로그인 정보가 유효하지 않습니다.")
    return str(user_id)


def _is_valid_route(route: Any) -> bool:
    if not isinstance(route, list) or len(route) < MIN_ROUTE_POINTS:
        return False
    for point in route:
        if not isinstance(point, (list, tuple)) or len(point) < 2:
            return False
        lon, lat = point[0], point[1]
        if isinstance(lon, bool) or isinstance(lat, bool):
            return False
        if not isinstance(lon, (int, float)) or not isinstance(lat, (int, float)):
            return False
        if not (math.isfinite(lon) and math.isfinite(lat)):
            return False
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            return False
    return True


def _load_own_record(client: Any, user_id: str, walk_id: str) -> Dict[str, Any]:
    """본인 기록만 돌려준다. 없거나 남의 것이면 똑같이 404 (남의 기록 존재 여부를 알려 주지 않는다)."""
    try:
        res = (
            client.table("walk_records")
            .select("id,user_id,route_coords,is_public")
            .eq("id", walk_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.exception("산책 기록 공개용 조회 실패: walk_id=%s", walk_id)
        raise WalkShareError(503, "WALK_SHARE_DB_ERROR", "산책 기록을 확인할 수 없습니다.") from exc
    rows = getattr(res, "data", None) or []
    if not rows or str(rows[0].get("user_id")) != user_id:
        raise WalkShareError(404, "WALK_NOT_FOUND", "산책 기록을 찾을 수 없습니다.")
    return rows[0]


def share_walk(client: Any, user_id: str, walk_id: str) -> Dict[str, Any]:
    """본인 산책 기록을 마스킹된 좌표로 공개한다."""
    record = _load_own_record(client, user_id, walk_id)
    route = record.get("route_coords")
    if not _is_valid_route(route):
        raise WalkShareError(422, "INVALID_ROUTE", "공개할 수 있는 경로 좌표가 아닙니다.")

    masked = apply_spatial_masking_to_course(
        route, masking_radius_m=MASKING_RADIUS_M, snap_to_intersection=True
    )
    masked_coords: List[List[float]] = masked.get("masked_coordinates") or []
    if len(masked_coords) < 2:
        # 마스킹 후 남는 경로가 없으면(너무 짧음) 공개하지 않는다. 원본을 대신 공개하지 않는다.
        raise WalkShareError(
            422, "ROUTE_TOO_SHORT_TO_MASK",
            "경로가 너무 짧아 출발·도착 주변 200m 를 가리면 공개할 수 없습니다.",
        )

    try:
        client.table("walk_records").update(
            {"is_public": True, "public_route_coords": masked_coords}
        ).eq("id", walk_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.exception("산책 기록 공개 저장 실패: walk_id=%s", walk_id)
        raise WalkShareError(503, "WALK_SHARE_DB_ERROR", "산책 기록을 커뮤니티에 저장하지 못했습니다.") from exc
    logger.info("산책 기록 공개: walk_id=%s masked_points=%d", walk_id, len(masked_coords))
    return {"walk_id": walk_id, "is_public": True, "masked_point_count": len(masked_coords)}


def unshare_walk(client: Any, user_id: str, walk_id: str) -> Dict[str, Any]:
    """공개를 해제하고 공개용 좌표를 지운다."""
    _load_own_record(client, user_id, walk_id)
    try:
        client.table("walk_records").update(
            {"is_public": False, "public_route_coords": None}
        ).eq("id", walk_id).eq("user_id", user_id).execute()
    except Exception as exc:
        logger.exception("산책 기록 공개 해제 실패: walk_id=%s", walk_id)
        raise WalkShareError(503, "WALK_SHARE_DB_ERROR", "산책 기록 공개를 해제하지 못했습니다.") from exc
    logger.info("산책 기록 공개 해제: walk_id=%s", walk_id)
    return {"walk_id": walk_id, "is_public": False}
