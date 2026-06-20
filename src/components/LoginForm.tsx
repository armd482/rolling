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
      <mark className="bg-transparent font-semibold text-slate-800">
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
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-gray-400">
          이메일 주소
        </label>
        <div className="relative">
          <input
            id="email"
            aria-label="이메일 주소"
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
              blurTimer.current = setTimeout(() => setOpen(false), 120);
            }}
            placeholder="example@gmail.com"
            required
            disabled={loading}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-gray-900 placeholder-gray-400 outline-none transition focus:border-slate-500 focus:ring-4 focus:ring-slate-100 disabled:opacity-60"
          />

          {open && filtered.length > 0 && (
            <ul className="absolute z-20 mt-1.5 max-h-60 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-md">
              {filtered.map((s, idx) => (
                <li key={s.email}>
                  <button
                    type="button"
                    aria-label={`${s.nickname} 선택`}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (blurTimer.current) clearTimeout(blurTimer.current);
                      pick(s);
                    }}
                    onMouseEnter={() => setActive(idx)}
                    className={`flex w-full flex-col items-start rounded-lg px-3.5 py-2 text-left transition ${
                      active === idx ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-gray-700'
                    }`}
                  >
                    <span className="text-[10px] text-gray-400">
                      {highlight(s.nickname, query)}
                    </span>
                    <span className="text-xs">
                      {highlight(s.email, query)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-650 font-bold">
          {error}
        </p>
      )}

      <button
        type="submit"
        aria-label="로그인"
        disabled={loading}
        className="w-full rounded-xl bg-slate-900 py-3 font-semibold text-white transition hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            입장 중…
          </span>
        ) : (
          '로그인'
        )}
      </button>
    </form>
  );
}


