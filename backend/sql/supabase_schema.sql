-- ==============================================================================
-- 편안하개 (PetWalk) Supabase 스키마 v1  (3번 노희선 · 서버)
-- 기준: backend/agent/supabase_repository.py, backend/agent/hazard_service.py 가 insert/select 하는 컬럼명과 1:1 일치.
-- 적용: Supabase 대시보드 > SQL Editor > New query > 전체 붙여넣기 > Run
-- 재실행 안전 (IF NOT EXISTS / DROP POLICY IF EXISTS)
-- ==============================================================================

-- 1) 커뮤니티 공개 코스 (US-G2, 출발/도착 200m 마스킹)
CREATE TABLE IF NOT EXISTS public.community_courses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id         TEXT UNIQUE NOT NULL,          -- 서버 발급 'feed_N'
    title             VARCHAR(100) NOT NULL,
    masked_polyline   JSONB NOT NULL,                -- [[lon, lat], ...] 200m 절단본
    distance_m        DOUBLE PRECISION NOT NULL,
    duration_min      INTEGER NOT NULL,
    rating            DOUBLE PRECISION NOT NULL DEFAULT 5.0 CHECK (rating >= 1.0 AND rating <= 5.0),
    is_origin_masked  BOOLEAN NOT NULL DEFAULT TRUE,
    user_id           TEXT,                          -- Supabase Auth 연동 후 auth.users(id)::text 로 채움
    comment           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

-- 2) 현장 위험 제보 (US-D2 AC3)
CREATE TABLE IF NOT EXISTS public.hazard_reports (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id     TEXT UNIQUE NOT NULL,              -- 서버 발급 'hz_<ms>_<n>'
    user_id       TEXT NOT NULL,
    lat           DOUBLE PRECISION NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon           DOUBLE PRECISION NOT NULL CHECK (lon BETWEEN -180 AND 180),
    hazard_type   VARCHAR(30) NOT NULL CHECK (hazard_type IN ('high_curb','stairs','construction','broken_glass','dog_danger','none')),
    severity      VARCHAR(10) NOT NULL CHECK (severity IN ('info','warning','danger')),
    description   TEXT NOT NULL,
    photo_url     TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_hazard_reports_active_created ON public.hazard_reports (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_courses_created     ON public.community_courses (created_at DESC);

-- 3) RLS: 누구나 읽기 가능, 쓰기는 서버(service_role, RLS 우회)만.
--    anon 키로 직접 insert 하는 경로는 막는다 (프론트는 반드시 FastAPI 를 거친다).
ALTER TABLE public.community_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hazard_reports    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_community_courses" ON public.community_courses;
CREATE POLICY "public_read_community_courses" ON public.community_courses FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_read_hazard_reports" ON public.hazard_reports;
CREATE POLICY "public_read_hazard_reports" ON public.hazard_reports FOR SELECT USING (is_active = true);
