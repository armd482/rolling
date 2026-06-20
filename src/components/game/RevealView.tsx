'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameTarget, RevealMessage } from '@/types/game';

export default function RevealView({
  targets,
  messagesByAssignment,
  currentTargetIdx,
  revealPage,
  phaseEndsAt,
  iAmHost,
  onNav,
}: {
  targets: GameTarget[];
  messagesByAssignment: Record<string, RevealMessage[]>;
  currentTargetIdx: number;
  revealPage: number;
  phaseEndsAt: string | null;
  iAmHost: boolean;
  onNav: (dir: 'next' | 'prev') => void;
}) {
  const target = targets[currentTargetIdx];

  // stall 자동 진행 카운트다운
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const endMs = phaseEndsAt ? new Date(phaseEndsAt).getTime() : null;
  const remaining = endMs !== null ? Math.max(0, Math.ceil((endMs - now) / 1000)) : null;

  // 방장이 안 넘겨 마감이 지나면 자동으로 다음 장(위치당 1회만)
  const posKey = `${currentTargetIdx}:${revealPage}`;
  const firedRef = useRef('');
  useEffect(() => {
    if (remaining === 0 && firedRef.current !== posKey) {
      firedRef.current = posKey;
      onNav('next');
    }
  }, [remaining, posKey, onNav]);

  if (!target) {
    return <div className="flex flex-1 items-center justify-center text-gray-400">불러오는 중…</div>;
  }

  const msgs = messagesByAssignment[target.assignmentId] ?? [];
  // 페이지 0 = 대상 소개, 페이지 1.. = (주제 + 답변)
  const total = msgs.length + 1;
  const page = Math.min(Math.max(0, revealPage), total - 1);
  const isIntro = page === 0;
  const msg: RevealMessage | undefined = isIntro ? undefined : msgs[page - 1];

  const isFirst = currentTargetIdx === 0 && page === 0;
  const isLastTarget = currentTargetIdx === targets.length - 1;
  const isLastPage = page === total - 1;
  const isEnd = isLastTarget && isLastPage;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* 진행 표시 */}
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>
          대상 {currentTargetIdx + 1} / {targets.length}
        </span>
        <span>{isIntro ? '주인공 소개' : `답변 ${page} / ${msgs.length}`}</span>
      </div>

      {/* 카드 */}
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="lined relative w-full max-w-2xl rounded-2xl border border-gray-200 p-8 shadow-md">
          {isIntro ? (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-center">
              <p className="font-hand text-2xl text-gray-500">이번 주인공은</p>
              <p className="font-hand text-6xl text-indigo-600">{target.nickname}</p>
              <p className="font-hand text-2xl text-gray-500">님에게 도착한 롤링페이퍼 💌</p>
            </div>
          ) : (
            <>
              <p className="mb-1 font-hand text-2xl text-indigo-600">To. {target.nickname}</p>
              <h2 className="mb-6 text-2xl font-bold text-gray-800">{target.topic}</h2>
              {msg ? (
                <>
                  <p className="min-h-[8rem] whitespace-pre-wrap break-words font-hand text-3xl leading-relaxed text-gray-700">
                    {msg.content || <span className="text-gray-400">(내용 없음)</span>}
                  </p>
                  <p className="mt-6 text-right font-hand text-2xl text-gray-500">
                    from. {msg.writerNickname ?? '익명'}
                  </p>
                </>
              ) : (
                <p className="min-h-[8rem] font-hand text-2xl text-gray-400">
                  아직 작성된 메시지가 없습니다.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* 조작 */}
      {iAmHost ? (
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => onNav('prev')}
              disabled={isFirst}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-900"
            >
              ← 이전
            </button>
            <button
              onClick={() => onNav('next')}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {isEnd ? '공개 종료' : '다음 →'}
            </button>
          </div>
          {remaining !== null && (
            <p className="text-[11px] text-gray-400">
              {remaining}초 내 조작이 없으면 자동으로 넘어갑니다.
            </p>
          )}
        </div>
      ) : (
        <p className="text-center text-sm text-gray-400">
          방장이 페이지를 넘기고 있습니다…
          {remaining !== null && ` (미조작 시 ${remaining}초 후 자동 진행)`}
        </p>
      )}
    </div>
  );
}
