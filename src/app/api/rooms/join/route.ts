import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruneStaleMembers } from '@/lib/prune';

const MAX_PER_ROOM = 7;

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({ roomId: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id) || id < 1 || id > 7) {
    return NextResponse.json({ error: '잘못된 방입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 이미 들어가 있으면 그대로 통과
  const { data: mine } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (mine) return NextResponse.json({ ok: true });

  // 다른 방에 있으면 거절 (한 번에 한 방만)
  const { data: elsewhere } = await supabase
    .from('room_members')
    .select('room_id')
    .eq('user_id', session.id)
    .maybeSingle();
  if (elsewhere) {
    return NextResponse.json(
      { error: `이미 ${elsewhere.room_id}번 방에 있습니다.` },
      { status: 409 },
    );
  }

  // 진행 중인 방은 입장 불가 (대기 중일 때만 허용)
  const { data: room } = await supabase
    .from('rooms')
    .select('state')
    .eq('id', id)
    .maybeSingle();
  if (room && room.state !== 'lobby') {
    return NextResponse.json({ error: '이미 시작된 방입니다.' }, { status: 409 });
  }

  // 정원 확인 전, 유령(웹 닫고 떠난) 멤버를 먼저 정리해 빈자리를 회수한다
  await pruneStaleMembers(supabase, id);
  const { count } = await supabase
    .from('room_members')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', id);
  if ((count ?? 0) >= MAX_PER_ROOM) {
    return NextResponse.json({ error: '방이 가득 찼습니다.' }, { status: 409 });
  }

  const { error } = await supabase
    .from('room_members')
    .insert({ room_id: id, user_id: session.id });
  if (error) {
    // unique 위반(동시 입장) 등
    return NextResponse.json({ error: '입장에 실패했습니다.' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
