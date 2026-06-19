-- 기존 프로젝트에 "중복 접속 차단"과 "방 채팅"을 추가합니다.
-- Supabase > SQL Editor 에 통째로 붙여넣어 한 번 실행하세요.

-- 1) 같은 계정 중복 접속 차단(last-wins)
alter table public.users add column if not exists active_sid text;

-- 2) 방 채팅
create table if not exists public.room_chats (
  id         uuid primary key default gen_random_uuid(),
  room_id    int  not null references public.rooms(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  nickname   text not null,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_chat_room on public.room_chats(room_id, created_at);

alter table public.room_chats enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='room_chats' and policyname='read_chats') then
    create policy read_chats on public.room_chats for select using (true);
  end if;
end $$;

alter publication supabase_realtime add table public.room_chats;
