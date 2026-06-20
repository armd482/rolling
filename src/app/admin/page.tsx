import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin-session';
import { createClient } from '@/lib/supabase/server';
import type { AssignmentRow, MessageRow, UserRow, RoomRow } from '@/types/db';
import AdminResetButton from '@/components/AdminResetButton';
import AdminLogoutButton from '@/components/AdminLogoutButton';
import AdminSaveImageButton from '@/components/AdminSaveImageButton';
import AdminResults, { type AdminTarget } from '@/components/AdminResults';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/login');

  const supabase = await createClient();
  const [{ data: assignments }, { data: messages }, { data: users }, { data: rooms }] =
    await Promise.all([
      supabase
        .from('assignments')
        .select('*')
        .order('room_id', { ascending: true })
        .order('order_idx', { ascending: true }),
      supabase.from('messages').select('*').order('created_at', { ascending: true }),
      supabase.from('users').select('*'),
      supabase.from('rooms').select('id, mode'),
    ]);

  const userById = new Map((users ?? []).map((u: UserRow) => [u.id, u]));
  // 방 모드(익명/실명) — 답변 작성자 표시 방식을 토글로 제어하기 위해 함께 내려준다.
  const modeByRoom = new Map(
    ((rooms ?? []) as Pick<RoomRow, 'id' | 'mode'>[]).map((r) => [r.id, r.mode]),
  );
  const msgsByAssignment = new Map<string, MessageRow[]>();
  for (const m of (messages ?? []) as MessageRow[]) {
    const list = msgsByAssignment.get(m.assignment_id) ?? [];
    list.push(m);
    msgsByAssignment.set(m.assignment_id, list);
  }

  // 대상자(받는 사람) 기준으로 묶기 — 방/라운드와 무관하게 한 사람의 질문·답변을 한 그룹으로
  const byTarget = new Map<string, AdminTarget>();
  for (const a of (assignments ?? []) as AssignmentRow[]) {
    const anonymous = modeByRoom.get(a.room_id) === 'anonymous';
    const entry = {
      assignmentId: a.id,
      roomId: a.room_id,
      topic: a.topic,
      messages: (msgsByAssignment.get(a.id) ?? []).map((m) => ({
        writerNickname: userById.get(m.writer_user_id)?.nickname ?? '?',
        content: m.content,
        anonymous,
      })),
    };
    const nickname = userById.get(a.target_user_id)?.nickname ?? '?';
    const g = byTarget.get(a.target_user_id) ?? { key: a.target_user_id, nickname, entries: [] };
    g.entries.push(entry);
    byTarget.set(a.target_user_id, g);
  }
  const targets = [...byTarget.values()].sort((a, b) => a.nickname.localeCompare(b.nickname));

  const totalAssignments = (assignments ?? []).length;
  const totalMessages = (messages ?? []).length;

  return (
    <main className="readable mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-8 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">관리자 · 전체 결과</h1>
          <p className="mt-1 text-sm text-gray-500">
            대상자 {targets.length}명 · 배정 {totalAssignments}건 · 작성 {totalMessages}건
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AdminResetButton />
          <AdminSaveImageButton />
          <AdminLogoutButton />
        </div>
      </header>

      <AdminResults targets={targets} />
    </main>
  );
}
