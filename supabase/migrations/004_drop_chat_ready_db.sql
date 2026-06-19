-- 채팅 → Realtime Broadcast, 준비 → Realtime Presence 로 전환하면서
-- 더 이상 쓰지 않는 DB 객체를 제거합니다. (앱은 실행 안 해도 동작하지만, 정리용)
-- Supabase > SQL Editor 에서 실행하세요.

drop table if exists public.room_chats cascade;          -- 채팅 테이블 제거
alter table public.room_members drop column if exists ready;  -- 준비 컬럼 제거
