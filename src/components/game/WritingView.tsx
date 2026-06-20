'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameTarget } from '@/types/game';

// 질문 1개당 작성 시간(개별 관리). 제출하거나 시간이 끝나면 다음 질문으로 넘어간다.
const QUESTION_SECONDS = 120;

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
  // 현재 질문의 개별 마감 시각. 질문이 바뀔 때(제출/시간초과)마다 새로 부여한다.
  const [qDeadline, setQDeadline] = useState(() => Date.now() + QUESTION_SECONDS * 1000);
  const firedRef = useRef(false);
  const autoFiredRef = useRef<string | null>(null);

  const current = order[idx];
  const locked = current ? submitted.has(current.assignmentId) : false;

  // 전체 작성 단계 마감(서버 phase_ends_at): 떠난 작성자까지 포함해 단계를 끝내는 안전장치.
  const overallEnd = phaseEndsAt ? new Date(phaseEndsAt).getTime() : null;
  const overallRemaining =
    overallEnd !== null ? Math.max(0, Math.ceil((overallEnd - now) / 1000)) : null;
  const overallExpired = overallRemaining === 0;

  const qRemaining = Math.max(0, Math.ceil((qDeadline - now) / 1000));
  const qExpired = !!current && qRemaining === 0;
  const qUrgent = qRemaining <= 30;

  // 타이머 콜백이 참조할 최신 값(렌더 중 ref 쓰기 금지 → 효과에서 갱신)
  const latestRef = useRef<{
    current: GameTarget | undefined;
    locked: boolean;
    drafts: Record<string, string>;
    qDeadline: number;
    orderLen: number;
  }>({ current, locked, drafts, qDeadline, orderLen: order.length });
  useEffect(() => {
    latestRef.current = { current, locked, drafts, qDeadline, orderLen: order.length };
  });

  // 1초 틱 + 질문별 마감 시 현재 입력을 강제 제출하고 다음 질문으로(앞으로만).
  // setState 를 인터벌 콜백 안에서 호출하므로 렌더/효과 본문 규칙에 걸리지 않는다.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      const L = latestRef.current;
      if (
        L.current &&
        !L.locked &&
        Date.now() >= L.qDeadline &&
        autoFiredRef.current !== L.current.assignmentId
      ) {
        autoFiredRef.current = L.current.assignmentId;
        onWrite(L.current.userId, L.drafts[L.current.assignmentId] ?? '');
        setSubmitted((prev) => {
          const next = new Set(prev);
          next.add(L.current!.assignmentId);
          return next;
        });
        setIdx((i) => Math.min(L.orderLen - 1, i + 1));
        setQDeadline(Date.now() + QUESTION_SECONDS * 1000);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [onWrite]);

  useEffect(() => {
    if (overallExpired && !firedRef.current) {
      firedRef.current = true;
      onTimeUp();
    }
  }, [overallExpired, onTimeUp]);

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-500">작성할 주제가 없습니다. 잠시만 기다려 주세요.</p>
      </div>
    );
  }

  const value = drafts[current.assignmentId] ?? '';
  const submittedCount = order.filter((t) => submitted.has(t.assignmentId)).length;
  const allSubmitted = order.every((t) => submitted.has(t.assignmentId));

  function submit() {
    if (locked) return;
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
    setIdx((i) => Math.min(order.length - 1, i + 1));
    setQDeadline(Date.now() + QUESTION_SECONDS * 1000);
  }

  const progressPanel = (
    <aside className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900 sm:w-56 sm:shrink-0">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">완료 현황</h3>
      <ul className="flex flex-col gap-1.5">
        {progress.map((p) => (
          <li key={p.userId} className="flex items-center justify-between text-sm">
            <span>{p.nickname}</span>
            {p.done ? (
              <span className="text-emerald-500">✓ 완료</span>
            ) : (
              <span className="text-gray-400">작성 중</span>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );

  // 내 몫을 모두 제출했으면, 내가 작성한 내용을 한 화면씩(좌우 화살표로) 열람만 한다.
  if (allSubmitted) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
          <div className="flex flex-1 flex-col justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950/40">
            <h2 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">작성 완료</h2>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
              모두 제출했어요. 내가 남긴 내용을 확인하며 다른 사람을 기다려 주세요.
            </p>
          </div>
          {progressPanel}
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
            <div className="lined flex-1 whitespace-pre-wrap break-words rounded-lg border border-gray-100 px-3 py-2 font-hand text-2xl text-gray-700">
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
      </div>
    );
  }

  const inputDisabled = locked || qExpired || overallExpired;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
      {/* 이 질문의 개별 남은 시간 */}
      <div className="flex flex-1 items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-sm font-semibold">이 질문 남은 시간</h2>
          <p className="text-xs text-gray-500">
            질문마다 {Math.round(QUESTION_SECONDS / 60)}분씩, 제출하거나 시간이 끝나면 다음 질문으로
            넘어갑니다. (제출 {submittedCount}/{order.length})
          </p>
        </div>
        <div
          className={`font-mono text-3xl font-bold tabular-nums ${
            qUrgent ? 'text-red-500' : 'text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {fmt(qRemaining)}
        </div>
      </div>
      {progressPanel}
      </div>

      {/* 한 화면에 한 질문 */}
      <div className="flex flex-1 flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            질문 {idx + 1} / {order.length}
          </span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
            {current.nickname}
          </span>
        </div>

        <p className="whitespace-pre-wrap font-hand text-2xl text-gray-800">{current.topic}</p>

        <textarea
          value={value}
          disabled={inputDisabled}
          onChange={(e) => {
            const v = e.target.value;
            setDrafts((d) => ({ ...d, [current.assignmentId]: v }));
          }}
          rows={6}
          maxLength={2000}
          placeholder={inputDisabled ? '시간이 종료되었습니다.' : '내용을 입력하세요…'}
          className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:disabled:bg-gray-800"
        />

        <button
          onClick={submit}
          disabled={inputDisabled || !value.trim()}
          className="self-end rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          제출
        </button>
      </div>
    </div>
  );
}
