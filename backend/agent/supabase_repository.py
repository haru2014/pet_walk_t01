"""[편안하개 - PetWalk]
Supabase PostgreSQL 영속 저장소 및 로컬 인메모리 자동 폴백 리포지토리.

- community_courses: 200m 공간 마스킹된 커뮤니티 코스 피드 영구 보관 (US-G2)
- hazard_reports: 공공 현장 위험 제보 관리
- SUPABASE_URL / SUPABASE_KEY 미설정 또는 네트워크 단절 시 무중단 인메모리 캐시 자동 폴백
"""

import os
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("petwalk.supabase")

# 로컬 인메모리 기본 피드 (오프라인/미연결 시 기본 데이터)
_DEFAULT_LOCAL_FEEDS: List[Dict[str, Any]] = [
    {
        "course_id": "feed_1",
        "title": "성산근린공원 폭신한 숲길 루프",
        "masked_polyline": [
            [126.9082, 37.5668], [126.9088, 37.5673], [126.9096, 37.5680],
            [126.9103, 37.5687], [126.9106, 37.5693], [126.9102, 37.5700],
            [126.9096, 37.5707], [126.9088, 37.5711], [126.9079, 37.5712],
            [126.9071, 37.5708], [126.9065, 37.5702], [126.9061, 37.5694],
            [126.9062, 37.5686], [126.9067, 37.5679], [126.9074, 37.5672],
            [126.9082, 37.5668],
        ],
        "distance_m": 1600.0,
        "duration_min": 26,
        "rating": 4.9,
        "is_origin_masked": True,
    },
    {
        "course_id": "feed_2",
        "title": "세종호수공원 은빛해변 & 수상무대섬 루프",
        "masked_polyline": [
            [127.2655, 36.5065], [127.2660, 36.5068], [127.2668, 36.5067],
            [127.2678, 36.5060], [127.2678, 36.5055], [127.2673, 36.5045],
            [127.2670, 36.5039], [127.2675, 36.5035], [127.2682, 36.5035],
            [127.2692, 36.5022], [127.2687, 36.5013], [127.2693, 36.5013],
            [127.2710, 36.5014], [127.2718, 36.5026], [127.2723, 36.5013],
            [127.2720, 36.5002], [127.2709, 36.4996], [127.2693, 36.4974],
            [127.2672, 36.4980], [127.2682, 36.5001], [127.2692, 36.5022],
            [127.2666, 36.5030], [127.2655, 36.5034], [127.2644, 36.5048],
            [127.2650, 36.5060], [127.2655, 36.5065],
        ],
        "distance_m": 2400.0,
        "duration_min": 36,
        "rating": 5.0,
        "is_origin_masked": True,
    },
    {
        "course_id": "feed_3",
        "title": "대전 유림공원 반도지 & 갑천 둔치 루프",
        "masked_polyline": [
            [127.3592, 36.3628], [127.3585, 36.3634], [127.3575, 36.3640],
            [127.3562, 36.3632], [127.3555, 36.3620], [127.3560, 36.3608],
            [127.3572, 36.3602], [127.3586, 36.3609], [127.3598, 36.3615],
            [127.3601, 36.3622], [127.3592, 36.3628],
        ],
        "distance_m": 1800.0,
        "duration_min": 28,
        "rating": 4.9,
        "is_origin_masked": True,
    },
    {
        "course_id": "feed_4",
        "title": "서울숲 안심 무장애 흙길",
        "masked_polyline": [
            [127.0365, 37.5435], [127.0373, 37.5442], [127.0382, 37.5448],
            [127.0394, 37.5452], [127.0406, 37.5450], [127.0414, 37.5444],
            [127.0412, 37.5435], [127.0403, 37.5428], [127.0390, 37.5425],
            [127.0376, 37.5428], [127.0365, 37.5435],
        ],
        "distance_m": 1400.0,
        "duration_min": 22,
        "rating": 5.0,
        "is_origin_masked": True,
    },
]

_memory_feeds: List[Dict[str, Any]] = list(_DEFAULT_LOCAL_FEEDS)


class SupabaseCommunityRepository:
    def __init__(self):
        self._client = None
        self._init_client()

    def _init_client(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_KEY")

        if url and key:
            try:
                import importlib
                supabase_mod = importlib.import_module("supabase")
                create_client_fn = getattr(supabase_mod, "create_client")
                self._client = create_client_fn(url, key)
                logger.info("[Supabase] 클라우드 PostgreSQL 클라이언트 초기화 성공")
            except Exception as e:
                logger.warning(f"[Supabase] 클라이언트 초기화 실패 (로컬 모드 유지): {e}")
                self._client = None
        else:
            self._client = None

    def is_connected(self) -> bool:
        return self._client is not None

    def get_feeds(self) -> List[Dict[str, Any]]:
        """커뮤니티 피드 목록 조회 (Supabase DB 우선, 실패 시 인메모리)."""
        if self._client:
            try:
                res = self._client.table("community_courses").select("*").order("created_at", desc=True).limit(50).execute()
                if res and res.data:
                    return res.data
            except Exception as e:
                logger.warning(f"[Supabase] 피드 조회 실패, 로컬 메모리 폴백: {e}")

        return list(_memory_feeds)

    def save_course(self, feed: Dict[str, Any]) -> Dict[str, Any]:
        """200m 마스킹된 커뮤니티 코스 저장 (Supabase DB 우선, 실패 시 인메모리)."""
        saved_feed = dict(feed)

        if self._client:
            try:
                db_payload = {
                    "course_id": saved_feed.get("course_id", f"feed_{len(_memory_feeds) + 1}"),
                    "title": saved_feed.get("title", "안심 산책 코스"),
                    "masked_polyline": saved_feed.get("masked_polyline", []),
                    "distance_m": float(saved_feed.get("distance_m", 0.0)),
                    "duration_min": int(saved_feed.get("duration_min", 0)),
                    "rating": float(saved_feed.get("rating", 5.0)),
                    "is_origin_masked": bool(saved_feed.get("is_origin_masked", True)),
                }
                res = self._client.table("community_courses").insert(db_payload).execute()
                if res and res.data:
                    saved_feed = res.data[0]
            except Exception as e:
                logger.warning(f"[Supabase] 코스 저장 실패, 로컬 메모리 폴백: {e}")

        _memory_feeds.insert(0, saved_feed)
        return saved_feed


# 전역 싱글톤 인스턴스
community_repo = SupabaseCommunityRepository()
