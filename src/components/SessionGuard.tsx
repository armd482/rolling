'use client';

import { useEffect, useRef } from 'react';

// 다른 곳에서 같은 계정으로 로그인하면 이 세션은 무효가 된다.
// 주기적으로(+탭 포커스 시) 확인해서 무효화되면 알림 후 로그아웃시킨다.
export default function SessionGuard({ intervalMs = 10000 }: { intervalMs?: number }) {
  // 재마운트/재렌더에도 단 한 번만 처리되도록 ref 로 가드
  const triggeredRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setInterval>;

    const onFocus = () => check();

    const cleanup = () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };

    async function check() {
      if (triggeredRef.current) return;
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!alive || triggeredRef.current || res.status !== 401) return;
        triggeredRef.current = true;
        cleanup();
        // 알림을 닫으면(확인) 로그아웃 처리 후 로그인 화면으로 (하드 내비게이션으로 완전히 이탈)
        window.alert('다른 곳에서 같은 계정으로 로그인되어 이 세션은 종료됩니다.');
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } finally {
          window.location.replace('/');
        }
      } catch {
        // 네트워크 오류는 무시
      }
    }

    check();
    timer = setInterval(check, intervalMs);
    window.addEventListener('focus', onFocus);

    return cleanup;
  }, [intervalMs]);

  return null;
}
