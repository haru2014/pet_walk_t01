-- ==============================================================================
-- 편안하개 (PetWalk) — 위험 제보 종류에 '들개·맹견(dog_danger)' 추가  (2번 전황진 · 이슈 #227, 앱 #228)
--
-- 무엇을 바꾸나
--   hazard_reports.hazard_type 의 허용 값(CHECK)에 'dog_danger' 를 더한다.
--   앱이 "위험한 개" 제보를 dog_danger 그대로 보내므로(#228), 이 제한이 남아 있으면 DB 저장이 거절되고
--   서버는 제보를 메모리에만 임시로 둔다(서버가 다시 시작되면 사라짐).
--
-- 적용: SQL Editor > New query > 전체 붙여넣기 > Run   (재실행 안전)
-- 되돌리기: 파일 맨 아래 "ROLLBACK" 블록 참고 (dog_danger 행이 있으면 먼저 정리해야 함)
-- ==============================================================================

-- 표를 만들 때 이름 없이 건 CHECK 는 PostgreSQL 이 hazard_reports_hazard_type_check 로 이름 붙인다.
ALTER TABLE public.hazard_reports DROP CONSTRAINT IF EXISTS hazard_reports_hazard_type_check;
ALTER TABLE public.hazard_reports
    ADD CONSTRAINT hazard_reports_hazard_type_check
    CHECK (hazard_type IN ('high_curb','stairs','construction','broken_glass','dog_danger','none'));

-- 확인: 아래 결과에 dog_danger 가 보이면 적용된 것이다.
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'hazard_reports_hazard_type_check';

-- ------------------------------------------------------------------------------
-- ROLLBACK (필요할 때만)
-- DELETE FROM public.hazard_reports WHERE hazard_type = 'dog_danger';
-- ALTER TABLE public.hazard_reports DROP CONSTRAINT IF EXISTS hazard_reports_hazard_type_check;
-- ALTER TABLE public.hazard_reports
--     ADD CONSTRAINT hazard_reports_hazard_type_check
--     CHECK (hazard_type IN ('high_curb','stairs','construction','broken_glass','none'));
-- ------------------------------------------------------------------------------
