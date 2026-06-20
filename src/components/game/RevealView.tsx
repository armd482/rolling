'use client';

import type { GameTarget, RevealMessage } from '@/types/game';

export default function RevealView({
  targets,
  messagesByAssignment,
  currentTargetIdx,
  revealPage,
  iAmHost,
  onNav,
  onJump,
}: {
  targets: GameTarget[];
  messagesByAssignment: Record<string, RevealMessage[]>;
  currentTargetIdx: number;
  revealPage: number;
  iAmHost: boolean;
  onNav: (dir: 'next' | 'prev') => void;
  onJump: (targetIdx: number) => void;
}) {
  const target = targets[currentTargetIdx];

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
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 진행 표시 */}
      <div className="flex items-center justify-between text-xs font-bold text-gray-400">
        <span className="flex items-center gap-1.5">
          <span>대상</span>
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600 border border-rose-100">
            {currentTargetIdx + 1} / {targets.length} 명째
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span>메시지</span>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] text-violet-600 border border-violet-100">
            {msgs.length > 0 ? `${page + 1} / ${total} 장` : '메시지 없음'}
          </span>
        </span>
      </div>


      {/* 참가자 바로가기 (방장만) — 누르면 해당 참가자 처음 페이지로 이동 */}
      {iAmHost && (
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {targets.map((t, i) => (
            <button
              key={t.assignmentId}
              type="button"
              onClick={() => onJump(i)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                i === currentTargetIdx
                  ? 'border-rose-300 bg-rose-500 text-white shadow-sm'
                  : 'border-rose-200/60 bg-white/70 text-gray-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
              }`}
            >
              {t.nickname}
            </button>
          ))}
        </div>
      )}

      {/* 카드 보드 영역 — 카드 양 옆에 이전/다음 버튼(방장만) */}
      <div className="flex min-h-0 flex-1 flex-col items-center pt-2">
        <div className="flex min-h-0 w-full max-w-5xl flex-1 items-stretch gap-2 sm:gap-3">
          {iAmHost && (
            <button
              type="button"
              onClick={() => onNav('prev')}
              disabled={isFirst}
              aria-label="이전 카드"
              className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="lined relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/60 p-10 shadow-[0_20px_50px_-10px_rgba(253,164,189,0.15)] tape bg-white/85">
          {isIntro ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <p className="text-lg text-gray-500 font-medium">이번 주인공</p>
              <h2 className="text-5xl font-bold tracking-tight text-gray-900 my-1">
                {target.nickname}
              </h2>
              <p className="text-base text-gray-500 leading-relaxed mt-2 max-w-md">
                동료들이 남긴 메시지가 도착했습니다.<br />
                다음 장을 넘겨 확인해 보세요.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-4 shrink-0">
                <p className="text-lg font-bold text-blue-600">To. {target.nickname}</p>
                <h2 className="mt-2 text-xl font-extrabold text-gray-800 leading-snug border-b border-gray-150/50 pb-4">
                  Q. {target.topic}
                </h2>
              </div>

              {msg ? (
                <div className="mt-2 flex min-h-0 flex-1 flex-col justify-between gap-6 overflow-hidden">
                  {/* 답변이 길면 카드 안에서 스크롤(카드 높이는 고정) */}
                  <div className="flex-1 overflow-y-auto pr-1">
                    <p className="whitespace-pre-wrap break-words font-hand text-lg leading-relaxed text-gray-700 font-medium tracking-wide">
                      {msg.content || <span className="text-gray-400 font-sans text-sm italic">(작성된 내용이 없습니다)</span>}
                    </p>
                  </div>
                  {/* 익명 모드면 작성자(from)를 아예 표시하지 않는다 */}
                  {msg.writerNickname && (
                    <p className="shrink-0 text-right font-hand text-xl text-violet-500 font-bold">
                      from. {msg.writerNickname}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2 flex flex-1 flex-col items-center justify-center text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                  <p className="text-sm text-gray-400 font-medium">아직 작성된 메시지가 없습니다.</p>
                </div>
              )}
            </div>
          )}
          </div>
          {iAmHost && (
            <button
              type="button"
              onClick={() => onNav('next')}
              disabled={isEnd}
              aria-label="다음 카드"
              className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 현재 대상의 페이지 진행 점 (소개 1장 + 메시지 장수) */}
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


      {/* 조작 컨트롤 패널 — 이전/다음은 카드 양 옆 버튼으로, 여기는 종료(방장)/안내(참가자) */}
      {iAmHost ? (
        isEnd && (
          <div className="flex justify-center relative z-10">
            <button
              onClick={() => onNav('next')}
              className="rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800"
            >
              롤링페이퍼 마침
            </button>
          </div>
        )
      ) : (
        <div className="text-center py-4 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white/70 border border-white/60 px-5 py-3 shadow-sm backdrop-blur-sm">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <p className="text-xs font-bold text-gray-500">방장이 카드를 넘기며 공개 중입니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
