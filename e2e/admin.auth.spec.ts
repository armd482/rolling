import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// 관리자 세션 캡처(1회성).
// 아이디/비밀번호를 코드에 두지 않고, 사람이 헤드리스 아닌 브라우저에서 직접 로그인한다.
// 로그인 성공(→ /admin) 후 쿠키(rp_admin)를 storageState 로 저장해 admin.spec.ts 가 재사용한다.
//
//   실행:  CAPTURE_ADMIN=1 npx playwright test e2e/admin.auth.spec.ts --headed
//
// CAPTURE_ADMIN 가 없으면 건너뛰므로 기본 `npm run test:e2e` 흐름을 막지 않는다.
export const ADMIN_AUTH_FILE = path.join(__dirname, '.auth/admin.json');

test('관리자 세션 캡처 — 열린 창에서 직접 로그인', async ({ page }) => {
  test.skip(!process.env.CAPTURE_ADMIN, 'CAPTURE_ADMIN=1 일 때만 실행 (사람이 직접 로그인)');
  test.setTimeout(180_000); // 직접 로그인할 시간(최대 3분)

  await page.goto('/admin/login');
  await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();

  // eslint-disable-next-line no-console
  console.log('\n👉 열린 브라우저 창에서 관리자 아이디/비밀번호로 로그인하세요. (최대 3분 대기)\n');

  // 로그인 성공 시 router.push('/admin') → 결과 헤더가 보일 때까지 대기.
  await expect(page.getByRole('heading', { name: '관리자 · 전체 결과' })).toBeVisible({
    timeout: 170_000,
  });

  fs.mkdirSync(path.dirname(ADMIN_AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: ADMIN_AUTH_FILE });
  // eslint-disable-next-line no-console
  console.log(`✅ 세션 저장됨: ${ADMIN_AUTH_FILE}\n`);
});
