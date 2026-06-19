-- 관리자 비밀번호를 DB(pgcrypto bcrypt)로 해시/검증한다.
-- 이렇게 하면 비밀번호 설정도 SQL Editor 에서 바로 가능하다:
--   insert into public.admins (username, password_hash)
--   values ('myadmin', crypt('비밀번호', gen_salt('bf', 12)))
--   on conflict (username) do update set password_hash = excluded.password_hash;
-- Supabase 대시보드 > SQL Editor 에 붙여넣어 실행하세요.

create extension if not exists pgcrypto;

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

-- 서버(service_role)만 호출 가능하도록 제한 → 클라이언트에서 비밀번호 대입 시도 차단.
revoke execute on function public.admin_verify(text, text) from public, anon, authenticated;
grant execute on function public.admin_verify(text, text) to service_role;
