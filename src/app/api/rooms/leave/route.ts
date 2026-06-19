import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({ roomId: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 방입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 게임 진행 중(작성/공개)에는 나갈 수 없다
  const { data: room } = await supabase.from('rooms').select('state').eq('id', id).maybeSingle();
  if (room && (room.state === 'writing' || room.state === 'revealing')) {
    return NextResponse.json(
      { error: '게임 진행 중에는 나갈 수 없습니다.' },
      { status: 409 },
    );
  }

  await supabase
    .from('room_members')
    .delete()
    .eq('room_id', id)
    .eq('user_id', session.id);

  // 방이 비면 대기 상태로 초기화
  const { count } = await supabase
    .from('room_members')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', id);
  if ((count ?? 0) === 0) {
    await supabase
      .from('rooms')
      .update({ state: 'lobby', current_target_idx: 0, reveal_page: 0 })
      .eq('id', id);
  }

  return NextResponse.json({ ok: true });
}
