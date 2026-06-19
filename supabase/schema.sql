-- =============================================================
-- 롤링페이퍼 DB 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.
-- =============================================================

-- ---------- 사용자 (화이트리스트) ----------
create table if not exists public.users (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  nickname  text not null,
  email     text not null unique,
  active_sid text,  -- 현재 활성 세션 id (같은 계정 중복 접속 차단, last-wins)
  created_at timestamptz not null default now()
);
-- 기존 설치 대상 컬럼 추가
alter table public.users add column if not exists active_sid text;

-- ---------- 방 (고정 7개) ----------
-- state: lobby(대기) | writing(작성중) | revealing(공개중) | finished(종료)
-- mode:  normal(일반) | anonymous(익명)
create table if not exists public.rooms (
  id                 int primary key,
  mode               text not null default 'normal' check (mode in ('normal','anonymous')),
  state              text not null default 'lobby'  check (state in ('lobby','writing','revealing','finished')),
  current_round      int  not null default 0,
  current_target_idx int  not null default 0,  -- revealing 단계에서 공개 중인 대상 순번
  reveal_page        int  not null default 0,  -- 현재 대상의 메시지 페이지
  updated_at         timestamptz not null default now()
);

-- 방 7개 시드
insert into public.rooms (id)
select g from generate_series(1,7) as g
on conflict (id) do nothing;

-- ---------- 방 참가자 ----------
create table if not exists public.room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   int  not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id)
);
-- 가장 먼저 들어온 사람이 방장 (min(joined_at))
-- 준비 상태(ready)는 DB가 아니라 Supabase Realtime Presence 로 관리한다.

-- ---------- 게임 라운드별 주제 배정 ----------
create table if not exists public.assignments (
  id             uuid primary key default gen_random_uuid(),
  room_id        int  not null references public.rooms(id) on delete cascade,
  round          int  not null,
  target_user_id uuid not null references public.users(id) on delete cascade,
  topic          text not null,
  order_idx      int  not null,   -- 공개 순서
  created_at     timestamptz not null default now(),
  unique (room_id, round, target_user_id)
);

-- ---------- 작성된 메시지 ----------
create table if not exists public.messages (
  id             uuid primary key default gen_random_uuid(),
  assignment_id  uuid not null references public.assignments(id) on delete cascade,
  writer_user_id uuid not null references public.users(id) on delete cascade,
  content        text not null,
  created_at     timestamptz not null default now(),
  unique (assignment_id, writer_user_id)  -- 한 대상에 대해 한 작성자는 1개
);

-- 방 채팅은 DB가 아니라 Supabase Realtime Broadcast 로 전송한다(영속 미저장).

create index if not exists idx_members_room   on public.room_members(room_id);
create index if not exists idx_assign_room_rd on public.assignments(room_id, round);
create index if not exists idx_msg_assignment on public.messages(assignment_id);
create index if not exists idx_msg_writer      on public.messages(writer_user_id);

-- =============================================================
-- RLS
-- 읽기(SELECT)는 모두 허용 → 클라이언트 Realtime 구독용.
-- 쓰기는 정책 없음 → service_role(서버 라우트 핸들러)만 가능.
-- =============================================================
alter table public.users        enable row level security;
alter table public.rooms        enable row level security;
alter table public.room_members enable row level security;
alter table public.assignments  enable row level security;
alter table public.messages     enable row level security;

do $$
begin
  -- users
  if not exists (select 1 from pg_policies where tablename='users' and policyname='read_users') then
    create policy read_users on public.users for select using (true);
  end if;
  -- rooms
  if not exists (select 1 from pg_policies where tablename='rooms' and policyname='read_rooms') then
    create policy read_rooms on public.rooms for select using (true);
  end if;
  -- room_members
  if not exists (select 1 from pg_policies where tablename='room_members' and policyname='read_members') then
    create policy read_members on public.room_members for select using (true);
  end if;
  -- assignments
  if not exists (select 1 from pg_policies where tablename='assignments' and policyname='read_assignments') then
    create policy read_assignments on public.assignments for select using (true);
  end if;
  -- messages
  if not exists (select 1 from pg_policies where tablename='messages' and policyname='read_messages') then
    create policy read_messages on public.messages for select using (true);
  end if;
end $$;

-- =============================================================
-- Realtime 발행 (테이블 변경을 클라이언트로 푸시)
-- =============================================================
do $$
begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_members;
alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.messages;
