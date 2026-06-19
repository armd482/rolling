'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 다른 곳에서 같은 계정으로 로그인하면 이 세션은 무효가 된다.
// 주기적으로(+탭 포커스 시) 확인해서 무효화되면 즉시 로그인 화면으로 보낸다.
export default function SessionGuard({ intervalMs = 10000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        if (alive && res.status === 401) {
          router.replace('/?kicked=1');
        }
      } catch {
        // 네트워크 오류는 무시
      }
    }

    check();
    const timer = setInterval(check, intervalMs);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);

    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [router, intervalMs]);

  return null;
}
