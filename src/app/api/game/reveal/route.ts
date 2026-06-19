import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { revealDeadline } from '@/lib/game';
import { effectiveHostId, originalHostId, originalHostOffline } from '@/lib/host';

// 공개 단계 페이지 이동. dir: 'next' | 'prev'
// - 방장: 언제든 next/prev 가능 (페이지를 넘길 때마다 stall 마감 갱신)
// - 그 외 참가자: 방장이 안 돌아와 stall 마감(phase_ends_at)이 지난 경우에만 'next' 자동 진행 가능
// 한 대상의 메시지를 한 장씩 넘기고, 마지막 장에서 next 면 다음 대상으로,
// 마지막 대상의 마지막 장에서 next 면 종료(finished)된다.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, dir } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id) || (dir !== 'next' && dir !== 'prev')) {
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
  const isMember = members.some((m) => m.user_id === session.id);
  if (!isMember) {
    return NextResponse.json({ error: '방 참가자가 아닙니다.' }, { status: 403 });
  }
  const isHost = effectiveHostId(members) === session.id;

  const { data: room } = await supabase
    .from('rooms')
    .select('state, current_round, current_target_idx, reveal_page, phase_ends_at')
    .eq('id', id)
    .maybeSingle();
  if (!room || room.state !== 'revealing') {
    return NextResponse.json({ error: '공개 단계가 아닙니다.' }, { status: 409 });
  }

  // 방장이 아니면: stall 마감이 지난 경우의 'next'(자동 진행)만 허용
  if (!isHost) {
    const stalled =
      !!room.phase_ends_at && Date.now() >= new Date(room.phase_ends_at).getTime();
    if (!stalled || dir !== 'next') {
      return NextResponse.json({ error: '방장만 조작할 수 있습니다.' }, { status: 403 });
    }
  }

  // 대상 순서
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

  // 각 대상의 메시지 수 (페이지 수, 최소 1)
  const aids = targets.map((t) => t.id);
  const { data: msgs } = await supabase
    .from('messages')
    .select('assignment_id')
    .in('assignment_id', aids);
  const pageCount = new Map<string, number>();
  for (const t of targets) pageCount.set(t.id, 0);
  for (const m of msgs ?? []) {
    pageCount.set(m.assignment_id, (pageCount.get(m.assignment_id) ?? 0) + 1);
  }
  const pagesOf = (idx: number) => Math.max(1, pageCount.get(targets[idx].id) ?? 0);

  const ti0 = room.current_target_idx;
  const pg0 = room.reveal_page;
  let ti = ti0;
  let pg = pg0;

  if (dir === 'next') {
    if (pg < pagesOf(ti) - 1) {
      pg += 1;
    } else if (ti < targets.length - 1) {
      ti += 1;
      pg = 0;
    } else {
      // 마지막 대상의 마지막 장 → 종료. 직전 위치가 같을 때만 1회 적용.
      const { error, count } = await supabase
        .from('rooms')
        .update({ state: 'finished', phase_ends_at: null }, { count: 'exact' })
        .eq('id', id)
        .eq('state', 'revealing')
        .eq('current_target_idx', ti0)
        .eq('reveal_page', pg0);
      if (error) return NextResponse.json({ error: '전환 실패' }, { status: 500 });
      // 이 요청이 실제로 종료를 적용했을 때(count===1), 원래 방장이 아직 미복귀(오프라인)면
      // 이탈한 것으로 보고 멤버에서 제거 → 방장 승계를 영구화한다.
      if (count === 1 && originalHostOffline(members)) {
        const evictId = originalHostId(members);
        if (evictId) {
          await supabase
            .from('room_members')
            .delete()
            .eq('room_id', id)
            .eq('user_id', evictId);
        }
      }
      return NextResponse.json({ ok: true, finished: true });
    }
  } else {
    if (pg > 0) {
      pg -= 1;
    } else if (ti > 0) {
      ti -= 1;
      pg = pagesOf(ti) - 1;
    }
    // 첫 대상의 첫 장이면 그대로
  }

  // 직전 위치(ti0,pg0)와 일치할 때만 적용 → 동시/중복 호출 시 1회만 이동
  const { error } = await supabase
    .from('rooms')
    .update({ current_target_idx: ti, reveal_page: pg, phase_ends_at: revealDeadline() })
    .eq('id', id)
    .eq('state', 'revealing')
    .eq('current_target_idx', ti0)
    .eq('reveal_page', pg0);
  if (error) return NextResponse.json({ error: '이동 실패' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
