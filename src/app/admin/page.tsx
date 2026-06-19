import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getValidSession, isAdminEmail } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { AssignmentRow, MessageRow, UserRow } from '@/types/db';

export const dynamic = 'force-dynamic';

type ResultEntry = {
  assignmentId: string;
  roomId: number;
  round: number;
  orderIdx: number;
  targetNickname: string;
  topic: string;
  messages: { writerNickname: string; content: string }[];
};

export default async function AdminPage() {
  const session = await getValidSession();
  if (!session) redirect('/');
  if (!isAdminEmail(session.email)) redirect('/rooms');

  const supabase = await createClient();
  const [{ data: assignments }, { data: messages }, { data: users }] = await Promise.all([
    supabase
      .from('assignments')
      .select('*')
      .order('room_id', { ascending: true })
      .order('round', { ascending: true })
      .order('order_idx', { ascending: true }),
    supabase.from('messages').select('*').order('created_at', { ascending: true }),
    supabase.from('users').select('*'),
  ]);

  const userById = new Map((users ?? []).map((u: UserRow) => [u.id, u]));
  const msgsByAssignment = new Map<string, MessageRow[]>();
  for (const m of (messages ?? []) as MessageRow[]) {
    const list = msgsByAssignment.get(m.assignment_id) ?? [];
    list.push(m);
    msgsByAssignment.set(m.assignment_id, list);
  }

  const entries: ResultEntry[] = ((assignments ?? []) as AssignmentRow[]).map((a) => ({
    assignmentId: a.id,
    roomId: a.room_id,
    round: a.round,
    orderIdx: a.order_idx,
    targetNickname: userById.get(a.target_user_id)?.nickname ?? '?',
    topic: a.topic,
    messages: (msgsByAssignment.get(a.id) ?? []).map((m) => ({
      writerNickname: userById.get(m.writer_user_id)?.nickname ?? '?',
      content: m.content,
    })),
  }));

  // 방 → 라운드 순으로 묶기
  const byRoom = new Map<number, Map<number, ResultEntry[]>>();
  for (const e of entries) {
    const rounds = byRoom.get(e.roomId) ?? new Map<number, ResultEntry[]>();
    const list = rounds.get(e.round) ?? [];
    list.push(e);
    rounds.set(e.round, list);
    byRoom.set(e.roomId, rounds);
  }
  const rooms = [...byRoom.keys()].sort((a, b) => a - b);

  const totalMessages = (messages ?? []).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">관리자 · 전체 결과</h1>
          <p className="mt-1 text-sm text-gray-500">
            배정 {entries.length}건 · 작성 {totalMessages}건
          </p>
        </div>
        <Link
          href="/rooms"
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          방 목록
        </Link>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500 dark:border-gray-700">
          아직 저장된 결과가 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-10">
          {rooms.map((roomId) => {
            const rounds = [...byRoom.get(roomId)!.keys()].sort((a, b) => a - b);
            return (
              <section key={roomId}>
                <h2 className="mb-4 text-lg font-semibold">{roomId}번 방</h2>
                <div className="flex flex-col gap-6">
                  {rounds.map((round) => (
                    <div key={round}>
                      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-gray-400">
                        {round}라운드
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {byRoom
                          .get(roomId)!
                          .get(round)!
                          .map((e) => (
                            <article
                              key={e.assignmentId}
                              className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
                            >
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                                  {e.targetNickname}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {e.messages.length}개 작성
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm font-medium text-gray-800 dark:text-gray-100">
                                {e.topic}
                              </p>
                              <ul className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                                {e.messages.length === 0 ? (
                                  <li className="text-xs text-gray-400">작성된 내용이 없습니다.</li>
                                ) : (
                                  e.messages.map((m, i) => (
                                    <li key={i} className="flex flex-col gap-0.5">
                                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                        {m.writerNickname}
                                      </span>
                                      <span className="whitespace-pre-wrap break-words text-sm">
                                        {m.content}
                                      </span>
                                    </li>
                                  ))
                                )}
                              </ul>
                            </article>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
