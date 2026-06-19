-- 같은 계정 중복 접속 차단(last-wins)용 컬럼.
-- 이미 schema.sql 을 적용한 기존 프로젝트에서 이 한 줄만 실행하면 됩니다.
alter table public.users add column if not exists active_sid text;
