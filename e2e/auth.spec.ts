import { test, expect } from '@playwright/test';

// 실제 로그인 플로우 (실 Supabase 사용 — 테스트 계정 active_sid 가 갱신됨)
test('화이트리스트 이메일 로그인 → 방 목록으로 이동', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('이메일 주소').fill('mathasdf0@gmail.com');
  // 자동완성 드롭다운을 닫고 폼 제출
  await page.getByLabel('이메일 주소').press('Escape');
  await page.getByRole('button', { name: '로그인' }).click();

  // 입장 상태에 따라 방 목록(/rooms) 또는 방(/rooms/{id})으로 가므로, 로그인 성공만 검증한다.
  await expect(page).toHaveURL(/\/rooms/);
  await expect(page.getByLabel('이메일 주소')).toHaveCount(0);
});

test('관리자 로그인 — 잘못된 자격은 거부된다', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('아이디').fill('__nobody__');
  await page.getByLabel('비밀번호').fill('__wrong__');
  await page.getByRole('button', { name: '로그인' }).click();

  await expect(page.getByText(/올바르지 않습니다/)).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login/);
});
