-- ==============================================================================
-- 편안하개 (PetWalk) — 산책 기록 공개(후기 공유) 개인정보 보호 마이그레이션  (3번 노희선 · 이슈 #116 · 방식 "가")
--
-- 무엇을 바꾸나
--   1) walk_records 에 public_route_coords(서버가 200m 마스킹한 공개용 좌표) 칸을 추가한다.
--   2) "is_public=true 인 행은 누구나 읽기" 정책(public_walk_reviews)을 없앤다.
--      → 그 정책은 행 전체(원본 route_coords 포함)를 공개해 버린다. (정책은 칸 단위로 가릴 수 없다)
--   3) 공개 후기는 전용 창구(view) public_walk_reviews_v 로만 읽는다.
--      원본 경로(route_coords), 사용자 id, 개 id, 사진, 시각은 이 창구에 없다.
--   4) 앱(로그인 사용자 = authenticated)은 is_public / public_route_coords 를 직접 쓸 수 없다.
--      공개·해제는 서버 API(POST /api/v1/walks/{id}/share, /unshare)만 한다. (서버 = service_role)
--   5) is_public=true 인데 공개용 좌표가 없는 행은 만들 수 없다(CHECK).
--
-- 적용: SQL Editor > New query > 전체 붙여넣기 > Run   (재실행 안전)
-- 되돌리기: 파일 맨 아래 "ROLLBACK" 블록 참고 (필요할 때만 실행)
-- ==============================================================================

-- 1) 공개용 마스킹 좌표 칸
ALTER TABLE public.walk_records ADD COLUMN IF NOT EXISTS public_route_coords JSONB;

-- 안전 조치: 공개용 좌표가 없는 채로 공개돼 있던 행이 있으면 비공개로 돌린다. (원본 노출 방지)
UPDATE public.walk_records SET is_public = FALSE WHERE is_public = TRUE AND public_route_coords IS NULL;

-- 2) 공개이면 공개용 좌표가 반드시 있어야 한다
ALTER TABLE public.walk_records DROP CONSTRAINT IF EXISTS walk_records_public_requires_masked;
ALTER TABLE public.walk_records
    ADD CONSTRAINT walk_records_public_requires_masked
    CHECK (NOT is_public OR public_route_coords IS NOT NULL);

-- 3) 행 전체를 공개하던 정책 제거 (본인 행 정책 own_walk_records 는 그대로)
DROP POLICY IF EXISTS "public_walk_reviews" ON public.walk_records;

-- 4) 공개 전용 창구 — 안전한 칸만. view 는 만든 사람(postgres) 권한으로 읽으므로 RLS 를 거치지 않는다.
DROP VIEW IF EXISTS public.public_walk_reviews_v;
CREATE VIEW public.public_walk_reviews_v WITH (security_invoker = false) AS
    SELECT
        id,
        course_id,
        distance_m,
        duration_min,
        rating,
        note,
        public_route_coords,
        created_at::date AS walked_on
    FROM public.walk_records
    WHERE is_public = TRUE AND public_route_coords IS NOT NULL;

REVOKE ALL ON public.public_walk_reviews_v FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_walk_reviews_v TO anon, authenticated;

-- 5) 앱이 공개 관련 칸을 직접 쓰지 못하게: 표 단위 쓰기 권한을 거두고, 허용하는 칸만 칸 단위로 다시 준다.
--    (SELECT 는 그대로, 행 접근은 RLS 의 own_walk_records 가 본인 것만 허용)
REVOKE INSERT, UPDATE ON public.walk_records FROM anon, authenticated;
GRANT INSERT (id, user_id, dog_id, course_id, started_at, ended_at, distance_m, duration_min,
              route_coords, photo_paths, note, rating)
    ON public.walk_records TO authenticated;
GRANT UPDATE (dog_id, course_id, ended_at, distance_m, duration_min,
              route_coords, photo_paths, note, rating)
    ON public.walk_records TO authenticated;

-- ==============================================================================
-- 적용 후 확인 (SQL Editor 에서 하나씩)
--   a) select policyname from pg_policies where tablename = 'walk_records';
--        → own_walk_records 만 있어야 한다 (public_walk_reviews 없음)
--   b) select column_name from information_schema.columns
--        where table_schema='public' and table_name='public_walk_reviews_v';
--        → route_coords, user_id, photo_paths 가 없어야 한다
--   c) select grantee, privilege_type, column_name from information_schema.column_privileges
--        where table_name='walk_records' and column_name in ('is_public','public_route_coords')
--          and grantee in ('anon','authenticated');
--        → UPDATE/INSERT 행이 없어야 한다 (SELECT 만 있을 수 있음)
-- ==============================================================================

-- ROLLBACK (되돌리기 — 개인정보 보호가 약해지므로 꼭 필요할 때만)
-- GRANT INSERT, UPDATE ON public.walk_records TO authenticated;
-- DROP VIEW IF EXISTS public.public_walk_reviews_v;
-- ALTER TABLE public.walk_records DROP CONSTRAINT IF EXISTS walk_records_public_requires_masked;
-- CREATE POLICY "public_walk_reviews" ON public.walk_records FOR SELECT USING (is_public = true);
