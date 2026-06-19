import { redirect } from 'next/navigation';
import { getValidSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import type { RoomRow, RoomMemberRow, UserRow } from '@/types/db';
import RoomList, { type RoomOverview } from '@/components/RoomList';

export const dynamic = 'force-dynamic';

export default async function RoomsPage() {
  const session = await getValidSession();
  if (!session) redirect('/');

  const supabase = await createClient();

  const [{ data: rooms }, { data: members }, { data: users }] = await Promise.all([
    supabase.from('rooms').select('*').order('id'),
    supabase.from('room_members').select('*'),
    supabase.from('users').select('*'),
  ]);

  const userById = new Map((users ?? []).map((u: UserRow) => [u.id, u]));

  const overview: RoomOverview[] = (rooms ?? []).map((room: RoomRow) => {
    const mems = (members ?? [])
      .filter((m: RoomMemberRow) => m.room_id === room.id)
      .sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    return {
      id: room.id,
      state: room.state,
      mode: room.mode,
      members: mems.map((m) => ({
        userId: m.user_id,
        nickname: userById.get(m.user_id)?.nickname ?? '?',
        isHost: false, // 아래에서 첫 번째를 방장으로
      })),
    };
  });
  // 첫 입장자 = 방장
  for (const r of overview) if (r.members[0]) r.members[0].isHost = true;

  const myRoomId =
    (members ?? []).find((m: RoomMemberRow) => m.user_id === session.id)?.room_id ?? null;

  return (
    <RoomList
      overview={overview}
      myUserId={session.id}
      myNickname={session.nickname}
      myRoomId={myRoomId}
    />
  );
}
