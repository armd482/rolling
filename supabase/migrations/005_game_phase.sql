-- 게임 작성 단계의 공용 마감 시각(모든 참가자가 같은 카운트다운을 보도록)
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.
alter table public.rooms add column if not exists phase_ends_at timestamptz;
