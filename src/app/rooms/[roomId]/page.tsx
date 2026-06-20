import { redirect } from 'next/navigation';
import { getValidSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { RoomRow, RoomMemberRow, UserRow, AssignmentRow, MessageRow } from '@/types/db';
import type { GameData, GameTarget, RevealMessage } from '@/types/game';
import RoomView, { type Member } from '@/components/RoomView';
import { effectiveHostId } from '@/lib/host';

export const dynamic = 'force-dynamic';

export default async function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const session = await getValidSession();
  if (!session) redirect('/');

  const roomId = Number((await params).roomId);
  if (!Number.isInteger(roomId) || roomId < 1 || roomId > 7) redirect('/rooms');

  const supabase = await createClient();

  const [{ data: room }, { data: members }, { data: users }] = await Promise.all([
    supabase.from('rooms').select('*').eq('id', roomId).maybeSingle<RoomRow>(),
    supabase.from('room_members').select('*').eq('room_id', roomId),
    supabase.from('users').select('*'),
  ]);

  // 이 방에 입장한 사용자가 아니면 목록으로
  const isMember = (members ?? []).some((m: RoomMemberRow) => m.user_id === session.id);
  if (!isMember) redirect('/rooms');

  const userById = new Map((users ?? []).map((u: UserRow) => [u.id, u]));
  const sortedMembers = (members ?? []).sort((a, b) =>
    a.joined_at.localeCompare(b.joined_at),
  );
  // 방장 = 가장 먼저 입장한 멤버 중 현재 접속 중(last_seen 최신)인 사람.
  // 원래 방장이 자리를 비우면 다음 접속 멤버가, 돌아오면 다시 원래 방장이 방장이 된다.
  const hostId = effectiveHostId(sortedMembers as RoomMemberRow[]);
  const memberList: Member[] = sortedMembers.map((m) => ({
    userId: m.user_id,
    nickname: userById.get(m.user_id)?.nickname ?? '?',
    isHost: m.user_id === hostId,
  }));

  const state = room?.state ?? 'lobby';
  const mode = room?.mode ?? 'normal';

  // 게임 진행 중이면 배정/메시지 로드
  let game: GameData | null = null;
  if (room && state !== 'lobby') {
    const { data: assignments } = await supabase
      .from('assignments')
      .select('*')
      .eq('room_id', roomId)
      .order('order_idx', { ascending: true });

    const aRows = (assignments ?? []) as AssignmentRow[];
    const aids = aRows.map((a) => a.id);

    let mRows: MessageRow[] = [];
    if (aids.length) {
      const { data: msgs } = await supabase.from('messages').select('*').in('assignment_id', aids);
      mRows = (msgs ?? []) as MessageRow[];
    }

    const targets: GameTarget[] = aRows.map((a) => ({
      assignmentId: a.id,
      userId: a.target_user_id,
      nickname: userById.get(a.target_user_id)?.nickname ?? '?',
      topic: a.topic,
      orderIdx: a.order_idx,
    }));

    const myMessages: Record<string, string> = {};
    const messagesByAssignment: Record<string, RevealMessage[]> = {};
    const countByWriter = new Map<string, number>();
    for (const a of aRows) messagesByAssignment[a.id] = [];
    for (const m of mRows) {
      if (m.writer_user_id === session.id) myMessages[m.assignment_id] = m.content;
      countByWriter.set(m.writer_user_id, (countByWriter.get(m.writer_user_id) ?? 0) + 1);
      messagesByAssignment[m.assignment_id]?.push({
        writerNickname: mode === 'anonymous' ? null : userById.get(m.writer_user_id)?.nickname ?? '?',
        content: m.content,
      });
    }

    const required = Math.max(0, aRows.length - 1);
    const progress = memberList.map((m) => ({
      userId: m.userId,
      nickname: m.nickname,
      done: (countByWriter.get(m.userId) ?? 0) >= required,
    }));

    game = {
      targets,
      myMessages,
      progress,
      messagesByAssignment,
    };
  }

  return (
    <RoomView
      roomId={roomId}
      state={state}
      mode={mode}
      currentTargetIdx={room?.current_target_idx ?? 0}
      revealPage={room?.reveal_page ?? 0}
      phaseEndsAt={room?.phase_ends_at ?? null}
      myUserId={session.id}
      myNickname={session.nickname}
      members={memberList}
      game={game}
    />
  );
}
