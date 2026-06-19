-- 참가자 준비 상태 (방장 제외)
-- Supabase > SQL Editor 에서 실행하세요.
alter table public.room_members add column if not exists ready boolean not null default false;
