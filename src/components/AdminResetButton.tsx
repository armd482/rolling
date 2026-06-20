'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminResetButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (busy) return;
    const ok = window.confirm(
      '모든 방·배정·작성 내용을 영구 삭제하고 초기 상태로 되돌립니다.\n이 작업은 되돌릴 수 없습니다. 계속할까요?',
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch('/api/admin/reset', { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        window.alert(d.error ?? '초기화에 실패했습니다.');
        return;
      }
      window.alert('초기 상태로 되돌렸습니다.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={reset}
      aria-label="전체 초기화"
      disabled={busy}
      className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-950"
    >
      {busy ? '초기화 중…' : '전체 초기화'}
    </button>
  );
}
