-- 관리자 계정 (id/비밀번호 로그인용).
-- 비밀번호는 평문이 아니라 PBKDF2 해시 문자열로만 저장한다.
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.
create table if not exists public.admins (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- RLS 활성화 + 정책 없음 → service_role(서버 라우트)만 접근 가능.
-- 클라이언트(anon/publishable)에서는 읽기/쓰기 모두 불가.
alter table public.admins enable row level security;
