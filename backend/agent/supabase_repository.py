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
        "masked_polyline": [[127.038, 37.544], [127.040, 37.545], [127.039, 37.543]],
        "distance_m": 1600.0,
        "duration_min": 26,
        "rating": 4.9,
        "is_origin_masked": True,
    },
    {
        "course_id": "feed_2",
        "title": "서울숲 안심 무장애 흙길",
        "masked_polyline": [[127.037, 37.544], [127.039, 37.545], [127.041, 37.544]],
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
