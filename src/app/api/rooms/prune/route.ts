import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruneStaleMembers } from '@/lib/prune';

// 로비의 유령(웹을 닫고 떠난) 멤버를 정리한다. 방 안의 참가자가 주기적으로 호출한다.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({ roomId: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 해당 방의 참가자만 호출 가능
  const { data: mine } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (!mine) return NextResponse.json({ error: '방 참가자가 아닙니다.' }, { status: 403 });

  const pruned = await pruneStaleMembers(supabase, id);
  return NextResponse.json({ ok: true, pruned });
}
