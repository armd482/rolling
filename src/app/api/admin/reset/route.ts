import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { createAdminClient } from '@/lib/supabase/admin';

// 관리자 전용: 모든 게임 데이터를 초기 상태로 되돌린다.
// 메시지·배정·방 참가자를 모두 삭제하고 방을 대기 상태로 리셋한다.
// users(화이트리스트·세션 active_sid)는 건드리지 않는다 → 로그인 상태 유지.
export async function POST() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: '관리자만 사용할 수 있습니다.' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const ALL_UUID = '00000000-0000-0000-0000-000000000000';

  // FK 순서대로 삭제: messages → assignments → room_members
  const del = [
    await supabase.from('messages').delete().neq('id', ALL_UUID),
    await supabase.from('assignments').delete().neq('id', ALL_UUID),
    await supabase.from('room_members').delete().neq('id', ALL_UUID),
  ];
  for (const r of del) {
    if (r.error) {
      return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
    }
  }

  // 방을 초기 상태(대기)로 리셋
  const { error } = await supabase
    .from('rooms')
    .update({
      mode: 'normal',
      state: 'lobby',
      current_round: 0,
      current_target_idx: 0,
      reveal_page: 0,
      phase_ends_at: null,
    })
    .gte('id', 1);
  if (error) {
    return NextResponse.json({ error: '방 초기화에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
