'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
      router.push('/admin/login');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={logout}
      aria-label="로그아웃"
      disabled={busy}
      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
    >
      로그아웃
    </button>
  );
}
