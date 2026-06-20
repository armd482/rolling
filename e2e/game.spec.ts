import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_USERS, loginAndJoin, resetTestRoom } from './helpers';

const ROOM = 7;

// 3명: 입장 → 준비 → 방장 시작 → 작성(각자 제출) → 공개 단계 진입까지의 전체 흐름.
// 실 Supabase + Realtime 을 사용하므로 동기화 대기 시간을 넉넉히 둔다.
test('3명 입장→준비→시작→작성→공개 전체 흐름', async ({ browser }) => {
  test.setTimeout(150_000);
  await resetTestRoom(ROOM);

  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept()); // 제출 confirm 자동 수락
    ctxs.push(ctx);
    pages.push(page);
  }

  try {
    // 순차 입장(배열 순서 = 입장 순서 → pages[0]이 방장)
    for (let i = 0; i < 3; i++) {
      await loginAndJoin(pages[i], TEST_USERS[i].email, ROOM);
    }
    const [host, p2, p3] = pages;

    // 방장 화면에 3명이 모일 때까지 대기
    await expect(host.getByText('현재 대기 인원 (3/5)')).toBeVisible({ timeout: 20000 });

    // 비방장 2명 준비
    await p2.getByRole('button', { name: '준비 상태 전환' }).click();
    await p3.getByRole('button', { name: '준비 상태 전환' }).click();

    // 전원 준비되면 방장 시작 버튼 활성화 → 시작
    const startBtn = host.getByRole('button', { name: '게임 시작하기' });
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // 모든 페이지가 작성 단계로 전환
    for (const p of pages) {
      await expect(p.getByText('이 질문 남은 시간')).toBeVisible({ timeout: 20000 });
    }

    // 각자 자기 몫(나 제외 2명)의 답변을 제출
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      for (let q = 0; q < TEST_USERS.length - 1; q++) {
        const input = p.getByLabel('답변 입력');
        await expect(input).toBeVisible({ timeout: 10000 });
        await input.fill(`E2E 답변 p${pi}-q${q}`);
        await p.getByRole('button', { name: '제출' }).click();
        await p.waitForTimeout(400);
      }
    }

    // 전원 완료 → 공개 단계. 방장 화면에 "이번 주인공"(소개 페이지) 표시
    await expect(host.getByText('이번 주인공')).toBeVisible({ timeout: 30000 });
  } finally {
    // 살아있는 클라이언트(타이머·heartbeat·Realtime)가 리셋을 되돌리지 못하도록
    // 컨텍스트를 모두 닫은 뒤 마지막에 방을 리셋한다.
    for (const c of ctxs) await c.close();
    await resetTestRoom(ROOM);
  }
});
