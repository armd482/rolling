'use client';

import { useEffect, useState } from 'react';
import type { GameTarget, RevealMessage } from '@/types/game';

export default function FinishedView({
  targets,
  messagesByAssignment,
}: {
  targets: GameTarget[];
  messagesByAssignment: Record<string, RevealMessage[]>;
}) {
  // 열려 있는 카드(대상)의 인덱스. null 이면 모달 닫힘.
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // 모달 안에서 현재 보고 있는 답변 인덱스(같은 질문에 대한 여러 답변을 좌/우로 넘김)
  const [msgIdx, setMsgIdx] = useState(0);

  const openTarget = openIdx === null ? null : targets[openIdx] ?? null;
  const openMsgs: RevealMessage[] = openTarget
    ? messagesByAssignment[openTarget.assignmentId] ?? []
    : [];

  function open(i: number) {
    setOpenIdx(i);
    setMsgIdx(0);
  }
  function close() {
    setOpenIdx(null);
  }

  // 키보드: ESC 닫기, ←/→ 답변 이동
  useEffect(() => {
    if (openIdx === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') setMsgIdx((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setMsgIdx((i) => Math.min(openMsgs.length - 1, i + 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIdx, openMsgs.length]);

  const total = openMsgs.length;
  const page = Math.min(Math.max(0, msgIdx), Math.max(0, total - 1));
  const curMsg: RevealMessage | undefined = openMsgs[page];

  return (
    <div className="flex min-h-0 flex-1 flex-col relative z-10">
      <div className="grid min-h-0 flex-1 items-stretch gap-6 overflow-y-auto pr-1 sm:grid-cols-2">
        {targets.map((t, i) => {
          const msgs: RevealMessage[] = messagesByAssignment[t.assignmentId] ?? [];
          return (
            <button
              key={t.assignmentId}
              type="button"
              onClick={() => open(i)}
              aria-label={`${t.nickname} 결과 보기`}
              className="glass-card flex h-[28rem] flex-col gap-4 rounded-3xl p-6 text-left transition hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            >
              <div className="shrink-0 border-b border-gray-150/40 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-hand text-2xl font-bold text-rose-500">To. {t.nickname}</p>
                  <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-500 border border-rose-100">
                    답변 {msgs.length}
                  </span>
                </div>
                <h3 className="mt-1 font-bold text-gray-800 leading-snug">
                  Q. {t.topic}
                </h3>
              </div>

              {msgs.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 text-center">
                  <p className="text-xs text-gray-400 font-bold">작성된 메시지가 없습니다.</p>
                </div>
              ) : (
                <ul className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                  {msgs.map((m, idx) => (
                    <li
                      key={idx}
                      className="glass-paper rounded-2xl border border-gray-150/30 px-4 py-3.5 shadow-sm"
                    >
                      <p className="whitespace-pre-wrap break-words font-hand text-base leading-relaxed text-gray-700">
                        {m.content || <span className="text-gray-400 font-sans text-xs italic">(내용 없음)</span>}
                      </p>
                      {/* 익명 모드면 작성자(from)를 아예 표시하지 않는다 */}
                      {m.writerNickname && (
                        <p className="mt-2 text-right font-hand text-lg text-violet-500 font-bold">
                          from. {m.writerNickname}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      {/* 답변 모달 — 한 화면에 한 답변, 좌/우로 같은 질문의 답변을 넘긴다 */}
      {openTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4 backdrop-blur-sm"
          onClick={close}
        >
          <div
            className="relative flex w-full max-w-2xl flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 닫기 */}
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="absolute -top-3 -right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-md transition hover:bg-gray-50 hover:text-gray-700"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            {/* 카드 + 양 옆 이전/다음 버튼 */}
            <div className="flex items-stretch gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMsgIdx((i) => Math.max(0, i - 1))}
                disabled={page === 0}
                aria-label="이전 답변"
                className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="lined relative flex h-[34rem] max-h-[72vh] min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/60 bg-white/95 p-10 shadow-[0_20px_60px_-10px_rgba(253,164,189,0.35)] tape">
              <div className="mb-4 shrink-0">
                <p className="text-lg font-bold text-blue-600">To. {openTarget.nickname}</p>
                <h2 className="mt-2 border-b border-gray-150/50 pb-4 text-xl font-extrabold leading-snug text-gray-800">
                  Q. {openTarget.topic}
                </h2>
              </div>

              {curMsg ? (
                <div className="mt-2 flex flex-1 flex-col justify-between gap-6 overflow-hidden">
                  <div className="flex-1 overflow-y-auto pr-1">
                    <p className="whitespace-pre-wrap break-words font-hand text-lg font-medium leading-relaxed tracking-wide text-gray-700">
                      {curMsg.content || <span className="font-sans text-sm italic text-gray-400">(작성된 내용이 없습니다)</span>}
                    </p>
                  </div>
                  {/* 익명 모드면 작성자(from)를 아예 표시하지 않는다 */}
                  {curMsg.writerNickname && (
                    <p className="shrink-0 text-right font-hand text-base font-bold text-violet-500">
                      from. {curMsg.writerNickname}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-center">
                  <p className="text-sm font-medium text-gray-400">아직 작성된 메시지가 없습니다.</p>
                </div>
              )}
            </div>
              <button
                type="button"
                onClick={() => setMsgIdx((i) => Math.min(total - 1, i + 1))}
                disabled={total === 0 || page >= total - 1}
                aria-label="다음 답변"
                className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* 페이지 점 + 위치 */}
            <div className="flex flex-col items-center gap-2">
              {total > 0 && (
                <div className="flex items-center justify-center gap-2">
                  {Array.from({ length: total }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-2.5 rounded-full transition-all duration-300 ${
                        i === page ? 'w-5 bg-rose-500' : 'w-2.5 bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              )}
              <span className="text-xs font-bold text-gray-500">
                {total > 0 ? `${page + 1} / ${total}` : '0 / 0'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
