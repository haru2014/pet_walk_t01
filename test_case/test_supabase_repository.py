"""[US-G2] Supabase 커뮤니티 리포지토리 및 오프라인 폴백 동작 검증 테스트."""

import pytest
from fastapi.testclient import TestClient
from main import app
from agent.supabase_repository import community_repo, SupabaseCommunityRepository


def test_supabase_repository_fallback_and_get_feeds():
    """Supabase 미연결/오프라인 환경에서도 안전하게 기본 피드를 반환해야 한다."""
    repo = SupabaseCommunityRepository()
    feeds = repo.get_feeds()
    assert len(feeds) >= 2
    assert feeds[0]["title"] == "성산근린공원 폭신한 숲길 루프"
    assert feeds[0]["is_origin_masked"] is True


def test_supabase_repository_save_course():
    """커뮤니티 코스 저장 시 피드가 정상 누적되고 앞단에 추가되어야 한다."""
    repo = SupabaseCommunityRepository()
    new_course = {
        "course_id": "test_feed_99",
        "title": "한강 망원나들목 그늘 산책로",
        "masked_polyline": [[126.9, 37.5], [126.91, 37.51]],
        "distance_m": 1250.0,
        "duration_min": 20,
        "rating": 4.8,
        "is_origin_masked": True,
    }
    saved = repo.save_course(new_course)
    assert saved["title"] == "한강 망원나들목 그늘 산책로"
    feeds = repo.get_feeds()
    assert feeds[0]["title"] == "한강 망원나들목 그늘 산책로"


def test_community_api_endpoints_via_testclient():
    """FastAPI REST 엔드포인트를 통한 커뮤니티 피드 조회 및 200m 마스킹 등록 검증."""
    client = TestClient(app)

    # 1. GET /api/v1/community/feed
    res_get = client.get("/api/v1/community/feed")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert "feeds" in data_get
    assert len(data_get["feeds"]) >= 1

    # 2. POST /api/v1/community/share
    share_payload = {
        "user_id": "usr_test_77",
        "course_title": "올림픽공원 폭신한 잔디 루프",
        "raw_coordinates": [
            [127.12, 37.51], [127.125, 37.515], [127.13, 37.52], [127.135, 37.525]
        ],
        "satisfaction_rating": 5,
        "comment": "발바닥에 무리 없는 최고의 잔디길"
    }
    res_post = client.post("/api/v1/community/share", json=share_payload)
    assert res_post.status_code == 200
    data_post = res_post.json()
    assert data_post["status"] == "shared"
    assert data_post["feed"]["title"] == "올림픽공원 폭신한 잔디 루프"
    assert data_post["feed"]["is_origin_masked"] is True

    # 3. GET /health 에서 supabase_connected 상태 확인
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert "supabase_connected" in res_health.json()
