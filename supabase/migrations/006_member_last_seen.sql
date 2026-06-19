-- 방장 승계용: 멤버 접속 여부 판정을 위한 마지막 활동 시각(하트비트)
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.
alter table public.room_members add column if not exists last_seen timestamptz not null default now();
