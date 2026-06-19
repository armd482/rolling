import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

// 종료(finished) 후 방장이 대기실로 되돌린다. 배정/메시지는 기록용으로 보존.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: hostRow } = await supabase
    .from('room_members')
    .select('user_id')
    .eq('room_id', id)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (hostRow?.user_id !== session.id) {
    return NextResponse.json({ error: '방장만 조작할 수 있습니다.' }, { status: 403 });
  }

  await supabase
    .from('rooms')
    .update({ state: 'lobby', current_target_idx: 0, reveal_page: 0, phase_ends_at: null })
    .eq('id', id);

  return NextResponse.json({ ok: true });
}
