import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { revealDeadline } from '@/lib/game';
import { effectiveHostId, originalHostId, originalHostOffline } from '@/lib/host';

// 공개 단계 위치 이동. 방장(접속 중 유효 방장)만 조작.
// 클라이언트가 낙관적으로 계산한 "절대 위치"를 보낸다 → 연타해도 최종 위치로 수렴(마지막 쓰기 승리).
//  - { targetIdx, page }: 해당 위치로 이동
//  - { finish: true }: 마지막 장에서 종료(finished)
// 직전처럼 직전 위치를 조건으로 거는 가드를 두지 않아, 동시 요청이 드롭되어 표시가 되돌아가는 문제를 없앤다.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장 여부 + 방 참가자 여부 (방장 = 현재 접속 중인 유효 방장)
  const { data: membersRows } = await supabase
    .from('room_members')
    .select('user_id, joined_at, last_seen')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });
  const members = membersRows ?? [];
  if (!members.some((m) => m.user_id === session.id)) {
    return NextResponse.json({ error: '방 참가자가 아닙니다.' }, { status: 403 });
  }
  if (effectiveHostId(members) !== session.id) {
    return NextResponse.json({ error: '방장만 조작할 수 있습니다.' }, { status: 403 });
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('state, current_round')
    .eq('id', id)
    .maybeSingle();
  if (!room || room.state !== 'revealing') {
    return NextResponse.json({ error: '공개 단계가 아닙니다.' }, { status: 409 });
  }

  // 종료
  if (body.finish) {
    const { error, count } = await supabase
      .from('rooms')
      .update({ state: 'finished', phase_ends_at: null }, { count: 'exact' })
      .eq('id', id)
      .eq('state', 'revealing');
    if (error) return NextResponse.json({ error: '전환 실패' }, { status: 500 });
    // 실제로 종료를 적용했을 때(count===1), 원래 방장이 아직 미복귀(오프라인)면 이탈 처리.
    if (count === 1 && originalHostOffline(members)) {
      const evictId = originalHostId(members);
      if (evictId) {
        await supabase.from('room_members').delete().eq('room_id', id).eq('user_id', evictId);
      }
    }
    return NextResponse.json({ ok: true, finished: true });
  }

  // 절대 위치 이동
  let ti = Number(body.targetIdx);
  let pg = Number(body.page);
  if (!Number.isInteger(ti) || !Number.isInteger(pg)) {
    return NextResponse.json({ error: '잘못된 위치입니다.' }, { status: 400 });
  }

  const { data: assignments } = await supabase
    .from('assignments')
    .select('id, order_idx')
    .eq('room_id', id)
    .eq('round', room.current_round)
    .order('order_idx', { ascending: true });
  const targets = assignments ?? [];
  if (!targets.length) {
    return NextResponse.json({ error: '배정 정보가 없습니다.' }, { status: 409 });
  }
  const aids = targets.map((t) => t.id);
  const { data: msgs } = await supabase
    .from('messages')
    .select('assignment_id')
    .in('assignment_id', aids);
  const msgCount = new Map<string, number>();
  for (const t of targets) msgCount.set(t.id, 0);
  for (const m of msgs ?? []) {
    msgCount.set(m.assignment_id, (msgCount.get(m.assignment_id) ?? 0) + 1);
  }
  // 페이지 = 대상 소개(0번) 1장 + 답변 수
  const pagesOf = (idx: number) => 1 + (msgCount.get(targets[idx].id) ?? 0);

  // 범위 보정 후 절대 설정 (조건부 가드 없음)
  ti = Math.max(0, Math.min(targets.length - 1, ti));
  pg = Math.max(0, Math.min(pagesOf(ti) - 1, pg));

  const { error } = await supabase
    .from('rooms')
    .update({ current_target_idx: ti, reveal_page: pg, phase_ends_at: revealDeadline() })
    .eq('id', id)
    .eq('state', 'revealing');
  if (error) return NextResponse.json({ error: '이동 실패' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
