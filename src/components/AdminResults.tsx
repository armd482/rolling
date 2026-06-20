'use client';

import { useState } from 'react';

export type AdminMessage = {
  writerNickname: string;
  content: string;
  // 익명 모드 방에서 작성된 답변인지 여부
  anonymous: boolean;
};
export type AdminEntry = {
  assignmentId: string;
  roomId: number;
  topic: string;
  messages: AdminMessage[];
};
export type AdminTarget = {
  key: string;
  nickname: string;
  entries: AdminEntry[];
};

export default function AdminResults({ targets }: { targets: AdminTarget[] }) {
  // true 면 익명 모드 답변의 작성자를 "익명"으로 가린다. 끄면 실제 이름을 보여준다.
  const [maskAnonymous, setMaskAnonymous] = useState(true);

  const hasAnonymous = targets.some((t) =>
    t.entries.some((e) => e.messages.some((m) => m.anonymous)),
  );

  const writerLabel = (m: AdminMessage) =>
    m.anonymous && maskAnonymous ? '익명' : m.writerNickname;

  return (
    <div className="flex flex-col gap-8">
      {/* 상단 토글: 익명 모드 작성자 표시 방식 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
        <div>
          <p className="text-sm font-semibold text-gray-800">익명 모드 작성자 가리기</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {hasAnonymous
              ? '켜면 익명 모드 방의 답변 작성자를 "익명"으로 표시하고, 끄면 실제 이름이 보입니다.'
              : '익명 모드로 작성된 답변이 아직 없습니다.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={maskAnonymous}
          aria-label="익명 모드 작성자 가리기 전환"
          onClick={() => setMaskAnonymous((v) => !v)}
          className="inline-flex shrink-0 items-center gap-2.5"
        >
          <span
            className={`relative h-6 w-11 rounded-full transition-colors ${
              maskAnonymous ? 'bg-blue-600' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                maskAnonymous ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </span>
          <span className="text-xs font-bold text-gray-600">
            {maskAnonymous ? '익명 표시' : '실명 표시'}
          </span>
        </button>
      </div>

      {targets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
          아직 저장된 결과가 없습니다.
        </p>
      ) : (
        <div id="admin-capture" className="flex flex-col gap-10 bg-white">
          {targets.map((t) => {
            const totalAnswers = t.entries.reduce((s, e) => s + e.messages.length, 0);
            return (
              <section key={t.key}>
                <h2 className="mb-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-gray-200 pb-3 text-xl font-bold text-gray-800">
                  {t.nickname} 님에게 전달된 롤링페이퍼
                  <span className="text-sm font-medium text-gray-400">
                    질문 {t.entries.length}개 · 답변 {totalAnswers}개
                  </span>
                </h2>
                <div className="flex flex-col gap-4">
                  {t.entries.map((e) => (
                    <article
                      key={e.assignmentId}
                      className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="whitespace-pre-wrap break-words text-[15px] font-bold leading-snug text-gray-800">
                          {e.topic}
                        </p>
                        <span className="mt-0.5 shrink-0 rounded-full bg-white px-2 py-0.5 text-xs text-gray-400 ring-1 ring-gray-200">
                          답변 {e.messages.length}
                        </span>
                      </div>
                      <ul className="flex-1 divide-y divide-gray-100">
                        {e.messages.length === 0 ? (
                          <li className="px-4 py-4 text-sm text-gray-400">작성된 내용이 없습니다.</li>
                        ) : (
                          e.messages.map((m, i) => (
                            <li key={i} className="px-4 py-3">
                              <p className="mb-1 text-xs font-semibold text-gray-500">
                                {writerLabel(m)}
                              </p>
                              <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-gray-800">
                                {m.content}
                              </p>
                            </li>
                          ))
                        )}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
