-- 011: round(회차) 개념 제거. 방마다 항상 "최신 1게임"만 유지한다.
-- 회차별 기록은 어디에도 노출되지 않던 부작용이라 폐기한다.
-- 적용 후 코드(start/write/reveal/to-reveal/page/admin)에서 round 참조도 함께 제거해야 한다.

-- 1) 같은 방·같은 대상에 여러 회차가 쌓여 있으면 최신 회차만 남긴다.
--    messages 는 assignment_id ON DELETE CASCADE 로 함께 정리된다.
delete from public.assignments a
using public.assignments b
where a.room_id = b.room_id
  and a.target_user_id = b.target_user_id
  and a.round < b.round;

-- 2) round 컬럼 제거 — 이 컬럼에 의존하던 unique(room_id, round, target_user_id) 제약도 함께 사라진다.
alter table public.assignments drop column if exists round;

-- 3) 방·대상당 1건을 보장하는 새 unique 제약(없을 때만 추가 → 재실행 안전).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assignments_room_target_key') then
    alter table public.assignments
      add constraint assignments_room_target_key unique (room_id, target_user_id);
  end if;
end $$;

-- 4) rooms.current_round 제거.
alter table public.rooms drop column if exists current_round;
