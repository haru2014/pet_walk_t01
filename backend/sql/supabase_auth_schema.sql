-- ==============================================================================
-- 편안하개 (PetWalk) Supabase 스키마 v2 - 로그인·개 프로필·산책 기록  (3번 노희선 · 서버)
-- 전제: supabase_schema.sql (community_courses, hazard_reports) 이 먼저 적용되어 있음.
-- 사전 설정(대시보드에서 수동):
--   1) Authentication > Sign In / Providers : Email ENABLED, Confirm email OFF (CBT 기간)
--   2) Storage > New bucket : pet-photos (Public OFF)
-- 적용: SQL Editor > New query > 전체 붙여넣기 > Run   (재실행 안전)
-- ==============================================================================

-- 1) 개 프로필 (랜딩 화면에서 가입 직후 등록. 사진은 Storage pet-photos/<user_id>/... 에 두고 URL 만 저장)
CREATE TABLE IF NOT EXISTS public.dog_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name              VARCHAR(30) NOT NULL,
    breed             VARCHAR(50),
    age_years         INTEGER CHECK (age_years BETWEEN 0 AND 30),
    weight_kg         DOUBLE PRECISION CHECK (weight_kg > 0 AND weight_kg < 120),
    joint_care_level  INTEGER NOT NULL DEFAULT 1 CHECK (joint_care_level BETWEEN 0 AND 3),
    speed_kmh         DOUBLE PRECISION NOT NULL DEFAULT 2.8,
    photo_path        TEXT,                              -- Storage 내 경로 예: '<user_id>/coco.jpg'
    is_primary        BOOLEAN NOT NULL DEFAULT TRUE,     -- 다견 가구: 대표견 1마리
    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_dog_profiles_user ON public.dog_profiles (user_id);

-- 2) 산책 기록 (마이페이지. 기본 비공개, 사용자가 "후기 공유" 를 누르면 is_public = true)
CREATE TABLE IF NOT EXISTS public.walk_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dog_id            UUID REFERENCES public.dog_profiles(id) ON DELETE SET NULL,
    course_id         TEXT,                              -- 추천 코스로 걸었다면 'candidate-loop-01' 등
    started_at        TIMESTAMPTZ NOT NULL,
    ended_at          TIMESTAMPTZ,
    distance_m        DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (distance_m >= 0),
    duration_min      INTEGER NOT NULL DEFAULT 0 CHECK (duration_min >= 0),
    route_coords      JSONB NOT NULL DEFAULT '[]'::jsonb, -- 실제 걸은 [[lon, lat], ...] 전체
    public_route_coords JSONB,                          -- 공개 후기용: 서버가 출발·도착 200m 를 가린 좌표 (앱은 직접 쓰지 못함)
    photo_paths       JSONB NOT NULL DEFAULT '[]'::jsonb, -- Storage 경로 목록 ['<user_id>/walks/...jpg']
    note              TEXT,
    rating            INTEGER CHECK (rating BETWEEN 1 AND 5),
    is_public         BOOLEAN NOT NULL DEFAULT FALSE,    -- 공개 후기 여부 (기본 비공개)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS idx_walk_records_user_started ON public.walk_records (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_walk_records_public       ON public.walk_records (is_public, created_at DESC);

-- 3) RLS: 본인 행만 읽고 쓸 수 있다. 공개 후기는 서버가 마스킹한 좌표만 전용 창구(view)로 공개한다.
--    서버(service_role) 는 RLS 를 우회하므로 영향 없음.
ALTER TABLE public.dog_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.walk_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_dog_profiles" ON public.dog_profiles;
CREATE POLICY "own_dog_profiles" ON public.dog_profiles
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own_walk_records" ON public.walk_records;
CREATE POLICY "own_walk_records" ON public.walk_records
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ※ 예전에는 여기서 "is_public=true 인 행은 누구나 읽기" 정책(public_walk_reviews)을 만들었다.
--   그 정책은 행 전체(원본 route_coords 포함)를 공개해 버리므로 없앴다. (이슈 #116)
--   공개 후기는 supabase_walk_public_migration.sql 의 전용 창구(view) public_walk_reviews_v 로만 읽는다.
--   이 파일을 다시 실행해도 예전 정책이 되살아나지 않도록, 남아 있으면 지운다.
DROP POLICY IF EXISTS "public_walk_reviews" ON public.walk_records;

-- 4) Storage 정책: pet-photos 보관함에서 본인 폴더(<user_id>/...) 만 올리고/보고/지울 수 있다.
DROP POLICY IF EXISTS "pet_photos_own_read"   ON storage.objects;
DROP POLICY IF EXISTS "pet_photos_own_insert" ON storage.objects;
DROP POLICY IF EXISTS "pet_photos_own_update" ON storage.objects;
DROP POLICY IF EXISTS "pet_photos_own_delete" ON storage.objects;

CREATE POLICY "pet_photos_own_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pet_photos_own_insert" ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pet_photos_own_update" ON storage.objects FOR UPDATE
    USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "pet_photos_own_delete" ON storage.objects FOR DELETE
    USING (bucket_id = 'pet-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 5) community_courses 의 user_id 를 로그인 계정과 연결 (기존 TEXT 컬럼은 유지, 값은 auth.users(id)::text 로 채움)
--    (컬럼 타입 변경은 기존 데이터 호환을 위해 하지 않는다)
