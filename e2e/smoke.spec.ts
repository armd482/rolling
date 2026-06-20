import { test, expect } from '@playwright/test';

// 인증 없이도 확인 가능한 렌더/리다이렉트 가드 스모크.
test.describe('스모크 — 렌더 & 인증 가드', () => {
  test('홈(로그인) 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '롤링페이퍼' })).toBeVisible();
    await expect(page.getByLabel('이메일 주소')).toBeVisible();
  });

  test('관리자 로그인 페이지가 렌더된다', async ({ page }) => {
    await page.goto('/admin/login');
    await expect(page.getByRole('heading', { name: '관리자 로그인' })).toBeVisible();
    await expect(page.getByLabel('아이디')).toBeVisible();
    await expect(page.getByLabel('비밀번호')).toBeVisible();
  });

  test('미인증 시 /rooms 는 홈으로 리다이렉트된다', async ({ page }) => {
    await page.goto('/rooms');
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    await expect(page.getByLabel('이메일 주소')).toBeVisible();
  });

  test('미인증 시 /admin 은 /admin/login 으로 리다이렉트된다', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});
