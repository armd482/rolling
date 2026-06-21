import { test, expect } from '@playwright/test';
import { service, TEST_USERS, login, resetTestRoom } from './helpers';

const ROOM = 6; // 테스트 전용(7은 game.spec 가 사용)

// 로비 방에 last_seen 이 오래된 유령 멤버를 심어두고, 다른 사용자가 방 목록을 열면
// 목록 표시뿐 아니라 DB 의 유령 행까지 즉시 정리되는지(option 2) 검증한다.
test('로비 방의 유령(stale) 멤버는 목록 로드 시 DB 에서 정리된다', async ({ page }) => {
  const sb = service();
  const ghost = TEST_USERS[2]; // 루디 — 로그인하지 않는 유령
  const viewer = TEST_USERS[0]; // 시오 — 목록을 여는 사용자

  await resetTestRoom(ROOM);

  // 유령 멤버 주입: last_seen 을 5분 전으로(=GHOST_THRESHOLD 60초 초과)
  const { data: u } = await sb.from('users').select('id').eq('email', ghost.email).maybeSingle();
  const ghostId = u!.id as string;
  const stale = new Date(Date.now() - 5 * 60_000).toISOString();
  await sb
    .from('room_members')
    .insert({ room_id: ROOM, user_id: ghostId, joined_at: stale, last_seen: stale });

  // 주입 확인
  const before = await sb
    .from('room_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('room_id', ROOM);
  expect(before.count).toBe(1);

  try {
    // 다른 사용자가 목록을 연다 → 서버 컴포넌트 렌더 중 prune 수행
    await login(page, viewer.email);
    await page.goto('/rooms');
    await expect(page.getByRole('heading', { name: '방 선택하기' })).toBeVisible({ timeout: 15000 });

    // 표시: 유령 닉네임이 목록에 없어야 한다
    await expect(page.getByText(ghost.nickname)).toHaveCount(0);

    // DB: 유령 행이 실제로 삭제됐어야 한다(active prune)
    const after = await sb
      .from('room_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('room_id', ROOM)
      .eq('user_id', ghostId);
    expect(after.count).toBe(0);
  } finally {
    await resetTestRoom(ROOM);
  }
});
