'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Suggestion = { email: string; nickname: string };

// 텍스트에서 query 와 일치하는 구간을 강조
function highlight(text: string, query: string) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-indigo-600 dark:text-indigo-400">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export default function LoginForm({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 입력값을 200ms debounce 하여 필터 쿼리로 사용
  useEffect(() => {
    const t = setTimeout(() => setQuery(email.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [email]);

  const filtered = useMemo(() => {
    if (!query) return [];
    return suggestions.filter(
      (s) => s.email.toLowerCase().includes(query) || s.nickname.toLowerCase().includes(query),
    );
  }, [query, suggestions]);

  // 목록이 바뀌면 하이라이트 초기화
  useEffect(() => {
    setActive(-1);
  }, [query]);

  // 선택 항목이 보이도록 스크롤
  useEffect(() => {
    if (active >= 0) itemRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(s: Suggestion) {
    setEmail(s.email);
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) {
      if (e.key === 'ArrowDown' && filtered.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActive(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? filtered.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      if (active >= 0) {
        e.preventDefault();
        pick(filtered[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '로그인에 실패했습니다.');
        setLoading(false);
        return;
      }
      // 성공 시 리다이렉트되므로 loading 을 유지(버튼·입력 깜빡임 방지)
      // 이미 방에 입장 중이면 그 방으로 바로 이동
      router.push(data.roomId ? `/rooms/${data.roomId}` : '/rooms');
      router.refresh();
    } catch {
      setError('네트워크 오류가 발생했습니다.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          이메일
        </label>
        <div className="relative">
          <input
            id="email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setOpen(true);
            }}
            onFocus={() => {
              if (email.trim()) setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // 옵션 클릭이 먼저 처리되도록 약간 지연
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            placeholder="you@gmail.com"
            required
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          />

          {open && filtered.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
              {filtered.map((s, idx) => (
                <li key={s.email}>
                  <button
                    type="button"
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onMouseDown={(e) => {
                      // blur 보다 먼저 실행되어 선택이 유지되도록
                      e.preventDefault();
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      pick(s);
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
                      active === idx ? 'bg-indigo-50 dark:bg-indigo-950/50' : ''
                    }`}
                  >
                    <span className="text-xs text-gray-400">
                      {highlight(s.nickname, query)}
                    </span>
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {highlight(s.email, query)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-indigo-600 px-4 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
      >
        {loading ? '확인 중…' : '입장하기'}
      </button>
    </form>
  );
}
