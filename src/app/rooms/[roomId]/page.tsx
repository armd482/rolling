import { redirect } from 'next/navigation';
import { getValidSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { RoomRow, RoomMemberRow, UserRow } from '@/types/db';
import RoomView, { type Member } from '@/components/RoomView';

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
  const memberList: Member[] = sortedMembers.map((m, idx) => ({
    userId: m.user_id,
    nickname: userById.get(m.user_id)?.nickname ?? '?',
    isHost: idx === 0,
  }));

  return (
    <RoomView
      roomId={roomId}
      state={room?.state ?? 'lobby'}
      mode={room?.mode ?? 'normal'}
      myUserId={session.id}
      myNickname={session.nickname}
      members={memberList}
    />
  );
}
