'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  chat,
}: {
  targets: GameTarget[];
  myMessages: Record<string, string>;
  myUserId: string;
  phaseEndsAt: string | null;
  progress: { userId: string; nickname: string; done: boolean }[];
  onWrite: (targetUserId: string, content: string) => void;
  onTimeUp: () => void;
  chat?: ReactNode;
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
  // 열람 화면(전부 제출) 진입 시 첫 카드로 한 번만 되돌리기 위한 가드
  const reviewResetRef = useRef(false);

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

  // 내 몫을 모두 제출해 열람 화면으로 바뀌면, 마지막 카드가 아니라 첫 카드부터 보이도록 한 번만 idx 를 0 으로.
  useEffect(() => {
    if (reviewResetRef.current) return;
    if (order.length > 0 && order.every((t) => submitted.has(t.assignmentId))) {
      reviewResetRef.current = true;
      setIdx(0);
    }
  }, [order, submitted]);

  if (!current) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[300px] rounded-3xl glass-card">
        <p className="text-sm font-semibold text-gray-500">작성할 주제가 없습니다. 잠시만 기다려 주세요.</p>
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
    // confirm 창이 열려 있는 동안 흐른 시간 때문에 now 가 뒤처지면, 다음 질문 타이머가
    // 잠깐 2:0x 로 떴다가 2:00 으로 보정된다. now 와 마감을 같은 기준 시각으로 함께 갱신해 방지.
    const t = Date.now();
    setIdx((i) => Math.min(order.length - 1, i + 1));
    setQDeadline(t + QUESTION_SECONDS * 1000);
    setNow(t);
  }

  // 작성 완료 현황 — 가로 칩(인원이 늘어도 줄바꿈되어 안정적)
  const progressPanel = (
    <div className="rounded-3xl glass-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          작성 완료 현황
        </h3>
        <span className="text-[10px] font-semibold text-gray-400">
          * 모든 참여자 완수 시 다음 단계로 자동 진행
        </span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {progress.map((p) => (
          <li
            key={p.userId}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
              p.done
                ? 'border-emerald-100 bg-emerald-50 text-emerald-600'
                : 'border-rose-100 bg-rose-50 text-rose-500'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                p.done ? 'bg-emerald-500' : 'bg-rose-400 animate-pulse'
              }`}
            />
            <span>{p.nickname}</span>
            <span className="text-[10px] opacity-70">{p.done ? '완료' : '작성 중'}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  // 내 몫을 모두 제출했으면, 내가 작성한 내용을 한 화면씩(좌우 화살표로) 열람만 한다.
  if (allSubmitted) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col justify-center rounded-3xl border border-emerald-200/50 bg-emerald-50/50 px-6 py-5 backdrop-blur-sm shadow-sm shadow-emerald-50">
            <h2 className="text-lg font-bold text-emerald-800">모든 롤링페이퍼 작성 완료</h2>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              내 몫의 작성을 무사히 마쳤습니다. 내가 남긴 글을 감상하며 다른 동료들이 작성을 마칠 때까지 잠시 대기해 주세요.
            </p>
          </div>
          {progressPanel}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col gap-5 rounded-3xl glass-card p-6 sm:p-8 tape relative">
            <div className="flex items-center justify-between border-b border-gray-100/50 pb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                내가 남긴 메시지 카드 {idx + 1} / {order.length}
              </span>
              <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 border border-rose-100">
                To. {current.nickname}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold text-gray-400">제시된 질문</p>
              <p className="text-lg font-bold text-gray-800 leading-normal">
                {current.topic}
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 mt-3">
              <p className="text-xs font-semibold text-gray-400">나의 답변</p>
              <div className="flex min-h-0 flex-1 items-stretch gap-2 sm:gap-3">
                <button
                  onClick={() => setIdx((i) => Math.max(0, i - 1))}
                  disabled={idx === 0}
                  aria-label="이전 카드"
                  className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M15 19l-7-7 7-7" />
                  </svg>
                </button>

                <div className="lined min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-gray-100 px-5 py-4 font-hand text-base text-gray-700 shadow-inner">
                  {drafts[current.assignmentId]}
                </div>

                <button
                  onClick={() => setIdx((i) => Math.min(order.length - 1, i + 1))}
                  disabled={idx === order.length - 1}
                  aria-label="다음 카드"
                  className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                    <path d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex shrink-0 justify-center gap-2">
              {order.map((t, i) => (
                <span
                  key={t.assignmentId}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    i === idx ? 'w-5 bg-rose-500' : 'w-2.5 bg-gray-300'
                  }`}
                />
              ))}
            </div>
          </div>
          </div>
          {chat && <div className="flex lg:w-80 lg:shrink-0">{chat}</div>}
        </div>

      </div>
    );
  }

  const inputDisabled = locked || qExpired || overallExpired;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      {/* 1) 남은 시간 (상단) */}
      <div className="flex items-center justify-between rounded-3xl glass-card p-6">
        <div>
          <h2 className="text-base font-bold text-gray-800">이 질문 남은 시간</h2>
          <p className="text-xs text-gray-400 font-semibold mt-1">
            한 질문당 {Math.round(QUESTION_SECONDS / 60)}분 제한, 완료 시 다음 질문으로 자동 전환. (제출 {submittedCount}/{order.length})
          </p>
        </div>
        <div
          className={`font-mono text-3xl font-extrabold tabular-nums px-4 py-2 rounded-2xl border ${
            qUrgent
              ? 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse'
              : 'text-violet-600 bg-violet-50/50 border-violet-100'
          }`}
        >
          {fmt(qRemaining)}
        </div>
      </div>

      {/* 2) 작성 완료 현황 (작성 카드 위) */}
      {progressPanel}

      {/* 3) 작성 카드 + 채팅 (질문 남은 시간·작성 완료 현황 아래에 배치) */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col gap-5 rounded-3xl glass-card p-8 tape relative">
        <div className="flex items-center justify-between border-b border-gray-150/40 pb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            롤링페이퍼 질문 {idx + 1} / {order.length}
          </span>
        </div>

        {/* 당사자(받는 사람) */}
        <div className="rounded-2xl border border-rose-200/60 bg-rose-50/70 px-5 py-4">
          <p className="truncate text-3xl font-extrabold leading-tight text-rose-600">
            {current.nickname}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-gray-400">전달된 질문 주제</p>
          <p className="font-hand text-3xl text-gray-800 leading-relaxed font-semibold">
            {current.topic}
          </p>
        </div>

        <textarea
          value={value}
          disabled={inputDisabled}
          onChange={(e) => {
            const v = e.target.value;
            setDrafts((d) => ({ ...d, [current.assignmentId]: v }));
          }}
          rows={6}
          maxLength={2000}
          placeholder={inputDisabled ? '시간이 종료되었습니다.' : '소중한 마음을 담은 답변을 이곳에 남겨보세요… (최대 2,000자)'}
          className="flex-1 min-h-[160px] resize-none rounded-2xl border border-gray-200 bg-white/70 px-4 py-3.5 text-sm outline-none transition focus:border-rose-400 focus:bg-white focus:ring-4 focus:ring-rose-100/50 disabled:bg-gray-100/70 disabled:text-gray-400"
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
        {chat && <div className="flex lg:w-80 lg:shrink-0">{chat}</div>}
      </div>
    </div>
  );
}
