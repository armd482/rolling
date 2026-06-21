import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_USERS, loginAndJoin, resetTestRoom, service } from './helpers';

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

// 방장이 답변 제한시간 "없음"을 고르면 → 피어 화면에도 즉시 반영(broadcast),
// 시작 후 작성 화면에 카운트다운/자동제출 없이 "답변 제한시간 없음" 으로 진행된다.
test('답변 제한시간 "없음" 설정이 동기화되고 타이머 없이 작성된다', async ({ browser }) => {
  test.setTimeout(150_000);
  await resetTestRoom(ROOM);

  const ctxs: BrowserContext[] = [];
  const pages: Page[] = [];
  for (let i = 0; i < 3; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('dialog', (d) => d.accept());
    ctxs.push(ctx);
    pages.push(page);
  }

  try {
    for (let i = 0; i < 3; i++) await loginAndJoin(pages[i], TEST_USERS[i].email, ROOM);
    const [host, p2, p3] = pages;
    await expect(host.getByText('현재 대기 인원 (3/5)')).toBeVisible({ timeout: 20000 });

    // 방장이 '없음' 선택 → 비방장 화면에도 "없음(무제한)" 으로 반영
    await host.getByRole('button', { name: '제한시간 없음 선택' }).click();
    await expect(p2.getByText(/없음\(무제한\)/)).toBeVisible({ timeout: 10000 });

    // 준비 → 시작
    await p2.getByRole('button', { name: '준비 상태 전환' }).click();
    await p3.getByRole('button', { name: '준비 상태 전환' }).click();
    const startBtn = host.getByRole('button', { name: '게임 시작하기' });
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // 작성 화면: 카운트다운 대신 "답변 제한시간 없음"
    for (const p of pages) {
      await expect(p.getByText('답변 제한시간 없음')).toBeVisible({ timeout: 20000 });
      await expect(p.getByText('이 질문 남은 시간')).toHaveCount(0);
    }

    // 타이머가 없어도 전원 제출하면 공개 단계로 진행
    for (let pi = 0; pi < pages.length; pi++) {
      const p = pages[pi];
      for (let q = 0; q < TEST_USERS.length - 1; q++) {
        const input = p.getByLabel('답변 입력');
        await expect(input).toBeVisible({ timeout: 10000 });
        await input.fill(`E2E 무제한 p${pi}-q${q}`);
        await p.getByRole('button', { name: '제출' }).click();
        await p.waitForTimeout(400);
      }
    }
    await expect(host.getByText('이번 주인공')).toBeVisible({ timeout: 30000 });
  } finally {
    for (const c of ctxs) await c.close();
    await resetTestRoom(ROOM);
  }
});

// 주제 풀(topics)이 참가자 수보다 적으면 시작이 거부되고 alert 이 뜬다(폴백 없음).
// ⚠ 이 테스트는 실 DB 의 topics 를 일시적으로 비웠다 복구하므로(파괴적) 기본 실행에서 제외한다.
//   실행:  DESTRUCTIVE_DB=1 npx playwright test e2e/game.spec.ts -g "주제가 참가자 수보다"
test('주제가 참가자 수보다 적으면 게임이 시작되지 않는다(alert)', async ({ browser }) => {
  test.skip(!process.env.DESTRUCTIVE_DB, 'DESTRUCTIVE_DB=1 일 때만 실행 (topics 풀을 일시 변경)');
  test.setTimeout(120_000);
  await resetTestRoom(ROOM);

  const sb = service();
  const { data: backup } = await sb.from('topics').select('text');
  const texts = (backup ?? []).map((t) => t.text as string);

  try {
    // 풀을 참가자(3)보다 적은 2개로 만든다. (assignments 전역 0건이라 FK 충돌 없음)
    await sb.from('topics').delete().neq('id', -1);
    await sb.from('topics').insert([{ text: '임시주제1' }, { text: '임시주제2' }]);

    const ctxs: BrowserContext[] = [];
    const pages: Page[] = [];
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      ctxs.push(ctx);
      pages.push(await ctx.newPage());
    }

    try {
      for (let i = 0; i < 3; i++) await loginAndJoin(pages[i], TEST_USERS[i].email, ROOM);
      const [host, p2, p3] = pages;

      await expect(host.getByText('현재 대기 인원 (3/5)')).toBeVisible({ timeout: 20000 });
      await p2.getByRole('button', { name: '준비 상태 전환' }).click();
      await p3.getByRole('button', { name: '준비 상태 전환' }).click();

      const startBtn = host.getByRole('button', { name: '게임 시작하기' });
      await expect(startBtn).toBeEnabled({ timeout: 20000 });

      // 시작 클릭 → 서버 400 → window.alert. 다이얼로그 메시지를 캡처한다.
      const dialogMsg = new Promise<string>((resolve) =>
        host.once('dialog', async (d) => {
          const m = d.message();
          await d.accept();
          resolve(m);
        }),
      );
      await startBtn.click();
      const msg = await dialogMsg;
      expect(msg).toContain('시작할 수 없습니다');
      expect(msg).toContain('주제');

      // 작성 단계로 넘어가지 않고 여전히 로비(시작 버튼 그대로).
      await expect(host.getByRole('button', { name: '게임 시작하기' })).toBeVisible();
      await expect(host.getByText('이 질문 남은 시간')).toHaveCount(0);
    } finally {
      for (const c of ctxs) await c.close();
    }
  } finally {
    // 주제 풀 원복 + 방 리셋.
    await sb.from('topics').delete().neq('id', -1);
    if (texts.length) await sb.from('topics').insert(texts.map((t) => ({ text: t })));
    await resetTestRoom(ROOM);
  }
});
