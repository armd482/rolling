import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 캡처된 관리자 세션(admin.auth.spec.ts 로 1회 생성)을 재사용해 /admin 결과 페이지를 검증한다.
// 세션 파일이 없으면 전체를 건너뛴다 → 자격 없이도 기본 `npm run test:e2e` 가 깨지지 않는다.
const authFile = path.join(__dirname, '.auth/admin.json');
const hasAuth = fs.existsSync(authFile);

test.describe('관리자 페이지(로그인 세션 필요)', () => {
  test.skip(!hasAuth, '먼저 세션을 캡처하세요: CAPTURE_ADMIN=1 npx playwright test e2e/admin.auth.spec.ts --headed');
  test.use({ storageState: hasAuth ? authFile : undefined });

  test('세션으로 /admin 결과 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/admin');

    // 로그인 가드를 통과해 /admin 에 머문다(미인증이면 /admin/login 으로 튕김).
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('heading', { name: '관리자 · 전체 결과' })).toBeVisible();
    // 요약 라인(대상자/배정/작성 건수)은 데이터 유무와 무관하게 항상 렌더된다.
    await expect(page.getByText(/대상자 .*명 · 배정 .*건 · 작성 .*건/)).toBeVisible();
  });

  test('로그아웃하면 /admin 접근이 로그인으로 막힌다', async ({ page }) => {
    await page.goto('/admin');
    await page.getByRole('button', { name: '로그아웃' }).click();

    // 로그아웃 후 보호 페이지 재진입 시 로그인으로 리다이렉트.
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
