'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameTarget } from '@/types/game';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Fisher-Yates 셔플(원본 불변)
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WritingView({
  targets,
  myMessages,
  myUserId,
  phaseEndsAt,
  progress,
  onWrite,
  onTimeUp,
}: {
  targets: GameTarget[];
  myMessages: Record<string, string>;
  myUserId: string;
  phaseEndsAt: string | null;
  progress: { userId: string; nickname: string; done: boolean }[];
  onWrite: (targetUserId: string, content: string) => void;
  onTimeUp: () => void;
}) {
  const myTargets = useMemo(() => targets.filter((t) => t.userId !== myUserId), [targets, myUserId]);

  // 질문 순서는 작성자마다 무작위(컴포넌트 생애 동안 고정)
  const [order] = useState(() => shuffle(myTargets));
  const [idx, setIdx] = useState(0);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const t of myTargets) d[t.assignmentId] = myMessages[t.assignmentId] ?? '';
    return d;
  });
  // 제출 완료(=수정 잠금) 집합. 이미 서버에 저장된 항목은 잠금 상태로 시작한다.
  const [submitted, setSubmitted] = useState<Set<string>>(() => new Set(Object.keys(myMessages)));
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const endMs = phaseEndsAt ? new Date(phaseEndsAt).getTime() : null;
  const remaining = endMs !== null ? Math.max(0, Math.ceil((endMs - now) / 1000)) : null;
  const expired = remaining === 0;
  const urgent = remaining !== null && remaining <= 30;

  useEffect(() => {
    if (expired && !firedRef.current) {
      firedRef.current = true;
      onTimeUp();
    }
  }, [expired, onTimeUp]);

  if (order.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">작성할 주제가 없습니다. 잠시만 기다려 주세요.</p>
      </div>
    );
  }

  const current = order[idx];
  const value = drafts[current.assignmentId] ?? '';
  const locked = submitted.has(current.assignmentId);
  const submittedCount = order.filter((t) => submitted.has(t.assignmentId)).length;

  function submit() {
    if (locked || expired) return;
    const content = (drafts[current.assignmentId] ?? '').trim();
    if (!content) return;
    const ok = window.confirm('제출하면 더 이상 수정할 수 없습니다. 제출하시겠습니까?');
    if (!ok) return;
    onWrite(current.userId, content);
    setSubmitted((prev) => {
      const next = new Set(prev);
      next.add(current.assignmentId);
      return next;
    });
    // 다음 미제출 질문으로 자동 이동
    let ni = -1;
    for (let i = idx + 1; i < order.length; i++) {
      if (!submitted.has(order[i].assignmentId)) {
        ni = i;
        break;
      }
    }
    if (ni === -1) {
      for (let i = 0; i < order.length; i++) {
        if (i !== idx && !submitted.has(order[i].assignmentId)) {
          ni = i;
          break;
        }
      }
    }
    if (ni !== -1) setIdx(ni);
  }

  const allSubmitted = order.every((t) => submitted.has(t.assignmentId));

  const progressAside = (
    <aside className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">완료 현황</h3>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {progress.map((p) => (
          <li key={p.userId} className="flex items-center gap-1.5 text-sm">
            <span>{p.nickname}</span>
            {p.done ? (
              <span className="text-emerald-500">✓</span>
            ) : (
              <span className="text-gray-400">…</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-gray-400">
        모두 작성 완료되거나 시간이 끝나면 공개 단계로 넘어갑니다.
      </p>
    </aside>
  );

  // 내 몫을 모두 제출했으면, 내가 작성한 내용을 한 화면씩(좌우 화살표로) 열람만 한다.
  if (allSubmitted) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div>
            <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">작성 완료</h2>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              모두 제출했어요. 내가 남긴 내용을 확인하며 기다려 주세요.
            </p>
          </div>
          <div
            className={`font-mono text-3xl font-bold tabular-nums ${
              urgent ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {remaining === null ? '--:--' : fmt(remaining)}
          </div>
        </div>

        <div className="flex flex-1 items-stretch gap-3">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            aria-label="이전"
            className="flex w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
                내가 작성한 내용 {idx + 1} / {order.length}
              </span>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                {current.nickname}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-base font-medium text-gray-800 dark:text-gray-100">
              {current.topic}
            </p>
            <div className="flex-1 whitespace-pre-wrap break-words rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200">
              {drafts[current.assignmentId]}
            </div>
            <div className="flex justify-center gap-1.5">
              {order.map((t, i) => (
                <span
                  key={t.assignmentId}
                  className={`h-2 w-2 rounded-full ${
                    i === idx ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-700'
                  }`}
                />
              ))}
            </div>
          </div>

          <button
            onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}
            disabled={idx === order.length - 1}
            aria-label="다음"
            className="flex w-12 shrink-0 items-center justify-center rounded-2xl border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-gray-900"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        {progressAside}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* 상단 타이머 */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-sm font-semibold">작성 시간</h2>
          <p className="text-xs text-gray-500">
            나를 제외한 {order.length}명의 주제에 글을 남겨 주세요. (제출 {submittedCount}/{order.length})
          </p>
        </div>
        <div
          className={`font-mono text-3xl font-bold tabular-nums ${
            urgent ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {remaining === null ? '--:--' : fmt(remaining)}
        </div>
      </div>

      {/* 한 화면에 한 질문 */}
      <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            질문 {idx + 1} / {order.length}
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
              {current.nickname}
            </span>
            {locked && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                제출 완료 · 수정 불가
              </span>
            )}
          </div>
        </div>

        <p className="whitespace-pre-wrap text-base font-medium text-gray-800 dark:text-gray-100">
          {current.topic}
        </p>

        <textarea
          value={value}
          disabled={locked || expired}
          onChange={(e) => {
            const v = e.target.value;
            setDrafts((d) => ({ ...d, [current.assignmentId]: v }));
          }}
          rows={6}
          maxLength={2000}
          placeholder={
            locked ? '제출 완료된 답변입니다.' : expired ? '시간이 종료되었습니다.' : '내용을 입력하세요…'
          }
          className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:disabled:bg-gray-800"
        />

        {!locked && (
          <button
            onClick={submit}
            disabled={expired || !value.trim()}
            className="self-end rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            제출
          </button>
        )}

        {/* 이동 */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            이전
          </button>
          <div className="flex gap-1.5">
            {order.map((t, i) => (
              <span
                key={t.assignmentId}
                className={`h-2 w-2 rounded-full ${
                  i === idx
                    ? 'bg-indigo-600'
                    : submitted.has(t.assignmentId)
                      ? 'bg-emerald-400'
                      : 'bg-gray-300 dark:bg-gray-700'
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}
            disabled={idx === order.length - 1}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            다음
          </button>
        </div>
      </div>

      {/* 완료 현황 */}
      {progressAside}
    </div>
  );
}
