import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { pickTopics, writingDeadline } from '@/lib/game';
import { effectiveHostId } from '@/lib/host';

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({ roomId: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id) || id < 1 || id > 7) {
    return NextResponse.json({ error: '잘못된 방입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장(현재 접속 중인 유효 방장) + 최소 3명
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at, last_seen')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });
  if (!members || members.length < 3) {
    return NextResponse.json({ error: '3명 이상 모여야 시작할 수 있습니다.' }, { status: 400 });
  }
  if (effectiveHostId(members) !== session.id) {
    return NextResponse.json({ error: '방장만 시작할 수 있습니다.' }, { status: 403 });
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('state, current_round')
    .eq('id', id)
    .maybeSingle();
  if (!room || room.state !== 'lobby') {
    return NextResponse.json({ error: '이미 시작된 방입니다.' }, { status: 409 });
  }

  const round = (room.current_round ?? 0) + 1;
  const topics = pickTopics(members.length);
  const rows = members.map((m, i) => ({
    room_id: id,
    round,
    target_user_id: m.user_id,
    topic: topics[i],
    order_idx: i,
  }));

  // 혹시 남아있을 동일 라운드 배정 정리 후 삽입
  await supabase.from('assignments').delete().eq('room_id', id).eq('round', round);
  const { error: aerr } = await supabase.from('assignments').insert(rows);
  if (aerr) {
    return NextResponse.json({ error: '주제 배정에 실패했습니다.' }, { status: 500 });
  }

  const { error: rerr } = await supabase
    .from('rooms')
    .update({
      state: 'writing',
      current_round: round,
      current_target_idx: 0,
      reveal_page: 0,
      phase_ends_at: writingDeadline(members.length),
    })
    .eq('id', id)
    .eq('state', 'lobby');
  if (rerr) {
    return NextResponse.json({ error: '시작에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
