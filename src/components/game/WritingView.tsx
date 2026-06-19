'use client';

import { useEffect, useRef, useState } from 'react';
import type { GameTarget } from '@/types/game';

function fmt(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
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
  const myTargets = targets.filter((t) => t.userId !== myUserId);

  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const t of myTargets) d[t.assignmentId] = myMessages[t.assignmentId] ?? '';
    return d;
  });
  const [saved, setSaved] = useState<Record<string, boolean>>({});
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

  function save(t: GameTarget) {
    onWrite(t.userId, drafts[t.assignmentId] ?? '');
    setSaved((s) => ({ ...s, [t.assignmentId]: true }));
  }

  function submitAll() {
    for (const t of myTargets) save(t);
  }

  const myDoneCount = myTargets.filter((t) => (drafts[t.assignmentId] ?? '').trim()).length;

  return (
    <div className="flex flex-1 flex-col gap-5">
      {/* 상단 타이머 */}
      <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-5 py-4 dark:border-gray-800 dark:bg-gray-900">
        <div>
          <h2 className="text-sm font-semibold">작성 시간</h2>
          <p className="text-xs text-gray-500">
            나를 제외한 {myTargets.length}명의 주제에 글을 남겨 주세요.
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

      <div className="grid flex-1 gap-5 lg:grid-cols-[1fr_220px]">
        {/* 작성 카드 */}
        <div className="grid content-start gap-4 sm:grid-cols-2">
          {myTargets.map((t) => {
            const value = drafts[t.assignmentId] ?? '';
            return (
              <div
                key={t.assignmentId}
                className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                    {t.nickname}
                  </span>
                  {saved[t.assignmentId] && (
                    <span className="text-xs text-emerald-500">저장됨</span>
                  )}
                </div>
                <p className="min-h-[2.5rem] whitespace-pre-wrap text-sm font-medium text-gray-800 dark:text-gray-100">
                  {t.topic}
                </p>
                <textarea
                  value={value}
                  disabled={expired}
                  onChange={(e) => {
                    setDrafts((d) => ({ ...d, [t.assignmentId]: e.target.value }));
                    setSaved((s) => ({ ...s, [t.assignmentId]: false }));
                  }}
                  onBlur={() => save(t)}
                  rows={4}
                  maxLength={2000}
                  placeholder={expired ? '시간이 종료되었습니다.' : '내용을 입력하세요…'}
                  className="w-full resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:disabled:bg-gray-800"
                />
              </div>
            );
          })}
        </div>

        {/* 완료 현황 */}
        <aside className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-xs font-medium uppercase tracking-wide text-gray-400">완료 현황</h3>
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
          <button
            onClick={submitAll}
            disabled={expired}
            className="mt-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-gray-700"
          >
            제출하기 ({myDoneCount}/{myTargets.length})
          </button>
          <p className="text-center text-[11px] text-gray-400">
            모두 작성 완료되거나 시간이 끝나면 공개 단계로 넘어갑니다.
          </p>
        </aside>
      </div>
    </div>
  );
}
