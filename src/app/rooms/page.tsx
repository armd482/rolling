import { redirect } from 'next/navigation';
import { getValidSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { staleMemberIds } from '@/lib/host';
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

  // 유령(웹을 닫고 떠나 last_seen 이 GHOST_THRESHOLD 를 넘긴) 멤버 정리.
  // - 로비 방만 대상: 진행/종료 중 방의 이탈 멤버는 방장 승계 설계상 유지해야 한다.
  // - 나 자신은 제외: 목록 페이지에선 heartbeat 가 멈춰 stale 로 보일 수 있어, 내 자리를 지운다.
  const lobbyRoomIds = new Set(
    (rooms ?? []).filter((r: RoomRow) => r.state === 'lobby').map((r) => r.id),
  );
  const ghosts = new Set(
    staleMemberIds((members ?? []).filter((m: RoomMemberRow) => lobbyRoomIds.has(m.room_id))),
  );
  ghosts.delete(session.id);

  // 목록을 열 때마다 DB 에서도 즉시 정리한다. 유령이 있을 때만 쓰기(대부분 로드는 skip).
  // 실패해도 아래 표시(liveMembers)에서 제외되므로 화면은 정상.
  if (ghosts.size > 0) {
    try {
      const admin = createAdminClient();
      await admin
        .from('room_members')
        .delete()
        .in('room_id', [...lobbyRoomIds])
        .in('user_id', [...ghosts]);
      // 유령 제거로 멤버가 0이 된 로비 방은 초기 상태로 리셋
      const survivors = new Map<number, number>();
      for (const m of members ?? []) {
        if (ghosts.has(m.user_id)) continue;
        survivors.set(m.room_id, (survivors.get(m.room_id) ?? 0) + 1);
      }
      const emptied = [...lobbyRoomIds].filter((id) => !survivors.get(id));
      if (emptied.length > 0) {
        await admin
          .from('rooms')
          .update({ state: 'lobby', current_target_idx: 0, reveal_page: 0, phase_ends_at: null })
          .in('id', emptied);
      }
    } catch {
      // 정리 실패는 무시 — 표시에서는 유령이 제외된다.
    }
  }

  const liveMembers = (members ?? []).filter((m: RoomMemberRow) => !ghosts.has(m.user_id));

  const overview: RoomOverview[] = (rooms ?? []).map((room: RoomRow) => {
    const mems = liveMembers
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
      myNickname={session.nickname}
      myRoomId={myRoomId}
    />
  );
}
