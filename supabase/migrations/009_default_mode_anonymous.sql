-- 방 공개 모드 기본값을 익명(anonymous)으로 변경.
-- 신규 방 생성 시 기본값 + 기존 7개 방(아직 게임을 시작하지 않은 대기방 포함)도 익명으로 맞춘다.
alter table public.rooms
  alter column mode set default 'anonymous';

-- 기존 방들을 익명으로 갱신(이미 정상 운영 중이라 일괄 적용).
update public.rooms set mode = 'anonymous';
