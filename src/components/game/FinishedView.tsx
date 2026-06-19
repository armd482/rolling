'use client';

import type { GameTarget, RevealMessage } from '@/types/game';

export default function FinishedView({
  targets,
  messagesByAssignment,
  iAmHost,
  onReset,
}: {
  targets: GameTarget[];
  messagesByAssignment: Record<string, RevealMessage[]>;
  iAmHost: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold">🎉 게임 종료</h2>
          <p className="text-sm text-gray-500">전체 결과를 확인하세요.</p>
        </div>
        {iAmHost && (
          <button
            onClick={onReset}
            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            다시 시작 (대기실로)
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {targets.map((t) => {
          const msgs: RevealMessage[] = messagesByAssignment[t.assignmentId] ?? [];
          return (
            <div
              key={t.assignmentId}
              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              <div>
                <p className="text-xs text-gray-400">{t.nickname} 님에게</p>
                <h3 className="font-semibold">{t.topic}</h3>
              </div>
              {msgs.length === 0 ? (
                <p className="text-sm text-gray-400">작성된 메시지가 없습니다.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {msgs.map((m, i) => (
                    <li
                      key={i}
                      className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-950"
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {m.content || <span className="text-gray-400">(내용 없음)</span>}
                      </p>
                      <p className="mt-1 text-right text-xs text-gray-400">
                        — {m.writerNickname ?? '익명'}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
