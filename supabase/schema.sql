-- =============================================================
-- 롤링페이퍼 DB 스키마 (통합본 / 최종 상태)
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣어 실행하세요.
-- 실행 후 seed.sql(사용자 + 주제 시드)을 이어서 실행합니다.
--
-- 채팅은 Realtime Broadcast, 준비 상태는 Realtime Presence 로 처리하므로
-- 해당 데이터용 테이블/컬럼은 두지 않는다.
-- =============================================================

create extension if not exists pgcrypto;  -- gen_random_uuid(), crypt()/gen_salt()

-- ---------- 사용자 (화이트리스트) ----------
create table if not exists public.users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  nickname   text not null,
  email      text not null unique,
  active_sid text,  -- 현재 활성 세션 id (같은 계정 중복 접속 차단, last-wins)
  created_at timestamptz not null default now()
);

-- ---------- 방 (고정 7개) ----------
-- state: lobby(대기) | writing(작성중) | revealing(공개중) | finished(종료)
-- mode:  normal(일반) | anonymous(익명) — 기본값은 익명
create table if not exists public.rooms (
  id                 int primary key,
  mode               text not null default 'anonymous' check (mode in ('normal','anonymous')),
  state              text not null default 'lobby'      check (state in ('lobby','writing','revealing','finished')),
  current_target_idx int not null default 0,   -- revealing 단계에서 공개 중인 대상 순번
  reveal_page        int not null default 0,   -- 현재 대상의 메시지 페이지
  phase_ends_at      timestamptz,              -- 현재 단계 공용 마감 시각(모두 같은 카운트다운)
  updated_at         timestamptz not null default now()
);

-- 방 7개 시드
insert into public.rooms (id)
select g from generate_series(1,7) as g
on conflict (id) do nothing;

-- ---------- 주제 풀 ----------
-- 게임 시작 시 이 표에서 멤버 수만큼 무작위로 뽑아 멤버당 하나씩 배정한다.
-- (시드는 seed.sql 참고. 풀이 참가자 수보다 적으면 게임이 시작되지 않는다.)
create table if not exists public.topics (
  id   bigint generated always as identity primary key,
  text text not null
);

-- ---------- 방 참가자 ----------
-- 가장 먼저 들어온 사람이 방장 (min(joined_at)).
-- last_seen 은 방장 승계용 하트비트.
create table if not exists public.room_members (
  id        uuid primary key default gen_random_uuid(),
  room_id   int  not null references public.rooms(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (room_id, user_id)
);

-- ---------- 게임 주제 배정 (방마다 최신 1게임만 유지) ----------
create table if not exists public.assignments (
  id             uuid   primary key default gen_random_uuid(),
  room_id        int    not null references public.rooms(id) on delete cascade,
  target_user_id uuid   not null references public.users(id) on delete cascade,
  topic_id       bigint not null references public.topics(id),  -- 주제 풀(topics) 참조
  order_idx      int    not null,   -- 공개 순서
  created_at     timestamptz not null default now(),
  unique (room_id, target_user_id)
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

-- ---------- 관리자 계정 (id/비밀번호 로그인) ----------
-- 비밀번호는 평문이 아니라 bcrypt 해시로만 저장한다. 계정 추가는 seed.sql 또는 SQL Editor 에서:
--   insert into public.admins (username, password_hash)
--   values ('myadmin', crypt('비밀번호', gen_salt('bf', 12)))
--   on conflict (username) do update set password_hash = excluded.password_hash;
create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- username/password 를 받아 admins 의 bcrypt 해시와 대조해 일치 여부를 반환.
-- crypt() 가 DB 안에서 수행되므로 서버는 비밀번호를 평문으로만 전달한다.
create or replace function public.admin_verify(p_username text, p_password text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.admins
    where username = p_username
      and password_hash = crypt(p_password, password_hash)
  );
$$;
-- 서버(service_role)만 호출 가능 → 클라이언트에서 비밀번호 대입 시도 차단.
revoke execute on function public.admin_verify(text, text) from public, anon, authenticated;
grant  execute on function public.admin_verify(text, text) to service_role;

-- ---------- 인덱스 ----------
create index if not exists idx_members_room   on public.room_members(room_id);
create index if not exists idx_assign_room    on public.assignments(room_id, order_idx);
create index if not exists idx_msg_assignment on public.messages(assignment_id);
create index if not exists idx_msg_writer     on public.messages(writer_user_id);

-- =============================================================
-- RLS
-- 읽기(SELECT)는 공개 → 클라이언트 Realtime 구독용.
-- 쓰기는 정책 없음 → service_role(서버 라우트 핸들러)만 가능.
-- admins 는 읽기 정책도 없음 → service_role 만 접근.
-- =============================================================
alter table public.users        enable row level security;
alter table public.rooms        enable row level security;
alter table public.topics       enable row level security;
alter table public.room_members enable row level security;
alter table public.assignments  enable row level security;
alter table public.messages     enable row level security;
alter table public.admins       enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='users' and policyname='read_users') then
    create policy read_users on public.users for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='rooms' and policyname='read_rooms') then
    create policy read_rooms on public.rooms for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='topics' and policyname='read_topics') then
    create policy read_topics on public.topics for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='room_members' and policyname='read_members') then
    create policy read_members on public.room_members for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='assignments' and policyname='read_assignments') then
    create policy read_assignments on public.assignments for select using (true);
  end if;
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

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='assignments') then
    alter publication supabase_realtime add table public.assignments;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname='supabase_realtime' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
