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


def test_get_feeds_combines_public_walk_reviews_without_exposing_private_fields():
    """공개 후기 뷰의 마스킹 경로는 기존 코스와 함께 피드에 노출한다."""
    class Query:
        def __init__(self, data):
            self.data = data

        def select(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            return type("Response", (), {"data": self.data})()

    class Client:
        def table(self, name):
            if name == "community_courses":
                return Query([{
                    "course_id": "course-1",
                    "title": "기존 커뮤니티 코스",
                    "masked_polyline": [[127.0, 37.5], [127.1, 37.6]],
                    "distance_m": 1000,
                    "duration_min": 20,
                    "rating": 4.5,
                    "is_origin_masked": True,
                    "created_at": "2025-01-01T00:00:00+00:00",
                }])
            return Query([{
                "id": "walk-1",
                "course_id": "internal-course-id",
                "distance_m": 1250,
                "duration_min": 25,
                "rating": 4.8,
                "note": "그늘이 많고 편안한 길",
                "public_route_coords": [[127.01, 37.51], [127.02, 37.52]],
                "walked_on": "2025-02-01",
                "user_id": "private-user-id",
                "route_coords": [[127.0, 37.5], [127.03, 37.53]],
            }])

    repo = SupabaseCommunityRepository()
    repo._client = Client()

    feeds = repo.get_feeds()

    assert [feed["course_id"] for feed in feeds] == ["walk_walk-1", "course-1"]
    walk_feed = feeds[0]
    assert walk_feed["title"] == "그늘이 많고 편안한 길"
    assert walk_feed["masked_polyline"] == [[127.01, 37.51], [127.02, 37.52]]
    assert walk_feed["is_origin_masked"] is True
    assert "user_id" not in walk_feed
    assert "route_coords" not in walk_feed
    assert "public_route_coords" not in walk_feed


def test_get_feeds_keeps_existing_courses_when_public_review_view_fails():
    """공개 후기 뷰 조회 오류가 기존 코스 피드까지 막지 않아야 한다."""
    class Query:
        def __init__(self, name):
            self.name = name

        def select(self, *_args):
            return self

        def order(self, *_args, **_kwargs):
            return self

        def limit(self, *_args):
            return self

        def execute(self):
            if self.name == "public_walk_reviews_v":
                raise RuntimeError("view unavailable")
            return type("Response", (), {"data": [{"course_id": "course-2"}]})()

    class Client:
        def table(self, name):
            return Query(name)

    repo = SupabaseCommunityRepository()
    repo._client = Client()

    assert repo.get_feeds() == [{"course_id": "course-2"}]


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
