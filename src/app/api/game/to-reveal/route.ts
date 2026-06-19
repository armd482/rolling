import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { effectiveHostId } from '@/lib/host';
import { revealDeadline } from '@/lib/game';

// 작성 단계 → 공개 단계 전환. 마감 시각이 지났거나 전원이 작성을 완료하면 전환한다.
// 어느 클라이언트가 호출해도 안전하도록 조건부 UPDATE 로 1회만 적용.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, force } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: room } = await supabase
    .from('rooms')
    .select('state, current_round, phase_ends_at')
    .eq('id', id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: '방을 찾을 수 없습니다.' }, { status: 404 });
  if (room.state !== 'writing') return NextResponse.json({ ok: true, already: true });

  const deadlinePassed =
    !!room.phase_ends_at && Date.now() >= new Date(room.phase_ends_at).getTime();

  // 전원 완료 여부 계산
  const [{ data: members }, { data: assignments }] = await Promise.all([
    supabase
      .from('room_members')
      .select('user_id, joined_at, last_seen')
      .eq('room_id', id)
      .order('joined_at', { ascending: true }),
    supabase.from('assignments').select('id').eq('room_id', id).eq('round', room.current_round),
  ]);
  const aids = (assignments ?? []).map((a) => a.id);
  const required = Math.max(0, aids.length - 1); // 자기 자신 제외
  let allDone = false;
  if (aids.length && members && members.length) {
    const { data: msgs } = await supabase
      .from('messages')
      .select('writer_user_id')
      .in('assignment_id', aids);
    const countByWriter = new Map<string, number>();
    for (const m of msgs ?? []) {
      countByWriter.set(m.writer_user_id, (countByWriter.get(m.writer_user_id) ?? 0) + 1);
    }
    allDone = members.every((m) => (countByWriter.get(m.user_id) ?? 0) >= required);
  }

  // 방장(현재 접속 중인 유효 방장)만 강제 전환 가능
  const canForce = !!force && effectiveHostId(members ?? []) === session.id;

  if (!deadlinePassed && !allDone && !canForce) {
    return NextResponse.json({ ok: false, allDone: false });
  }

  await supabase
    .from('rooms')
    .update({
      state: 'revealing',
      current_target_idx: 0,
      reveal_page: 0,
      // 공개 단계 자동진행(stall) 마감
      phase_ends_at: revealDeadline(),
    })
    .eq('id', id)
    .eq('state', 'writing');

  return NextResponse.json({ ok: true });
}
