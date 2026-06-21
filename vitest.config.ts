import { defineConfig } from 'vitest/config';

// 유닛 테스트는 src 의 순수 로직만 대상으로 한다.
// e2e(Playwright, ./e2e/*.spec.ts)와 섞이지 않도록 include 를 src 로 한정한다.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
