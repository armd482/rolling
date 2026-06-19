import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

// 접속 유지 신호. 방 화면이 열려 있는 동안 주기적으로 호출되어 last_seen 을 갱신한다.
// (방장 승계 판정에 사용)
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({ roomId: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase
    .from('room_members')
    .update({ last_seen: new Date().toISOString() })
    .eq('room_id', id)
    .eq('user_id', session.id);

  return NextResponse.json({ ok: true });
}
