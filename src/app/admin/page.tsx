import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-session';
import { createClient } from '@/lib/supabase/server';
import type { AssignmentRow, MessageRow, UserRow } from '@/types/db';
import AdminResetButton from '@/components/AdminResetButton';
import AdminLogoutButton from '@/components/AdminLogoutButton';

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
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/login');

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
    <main className="readable mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">관리자 · 전체 결과</h1>
          <p className="mt-1 text-sm text-gray-500">
            배정 {entries.length}건 · 작성 {totalMessages}건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminResetButton />
          <AdminLogoutButton />
        </div>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500 dark:border-gray-700">
          아직 저장된 결과가 없습니다.
        </p>
      ) : (
        <div className="flex flex-col gap-12">
          {rooms.map((roomId) => {
            const rounds = [...byRoom.get(roomId)!.keys()].sort((a, b) => a - b);
            return (
              <section key={roomId}>
                <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-gray-800">
                  <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md bg-indigo-600 px-2 text-sm font-bold text-white">
                    {roomId}
                  </span>
                  번 방
                </h2>
                <div className="flex flex-col gap-8">
                  {rounds.map((round) => (
                    <div key={round}>
                      <h3 className="mb-3 inline-block rounded-full bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-600">
                        {round}라운드
                      </h3>
                      <div className="grid gap-4 md:grid-cols-2">
                        {byRoom
                          .get(roomId)!
                          .get(round)!
                          .map((e) => (
                            <article
                              key={e.assignmentId}
                              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                            >
                              <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
                                <div className="mb-1 flex items-center justify-between">
                                  <span className="text-xs font-medium text-gray-500">받는 사람</span>
                                  <span className="text-xs text-gray-400">
                                    답변 {e.messages.length}개
                                  </span>
                                </div>
                                <p className="text-base font-bold text-indigo-700">
                                  {e.targetNickname}
                                </p>
                                <p className="mt-1 whitespace-pre-wrap text-[15px] font-medium text-gray-700">
                                  {e.topic}
                                </p>
                              </div>
                              <ul className="divide-y divide-gray-100">
                                {e.messages.length === 0 ? (
                                  <li className="px-4 py-3 text-sm text-gray-400">
                                    작성된 내용이 없습니다.
                                  </li>
                                ) : (
                                  e.messages.map((m, i) => (
                                    <li key={i} className="px-4 py-3">
                                      <p className="mb-0.5 text-xs font-semibold text-gray-500">
                                        {m.writerNickname}
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
