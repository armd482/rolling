import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, ready } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id) || id < 1 || id > 7) {
    return NextResponse.json({ error: '잘못된 방입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장(가장 먼저 입장)은 준비 상태가 없다.
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });

  const inRoom = (members ?? []).find((m) => m.user_id === session.id);
  if (!inRoom) {
    return NextResponse.json({ error: '방에 입장한 사용자만 가능합니다.' }, { status: 403 });
  }
  const hostId = members?.[0]?.user_id;
  if (hostId === session.id) {
    return NextResponse.json({ error: '방장은 준비 상태를 바꿀 수 없습니다.' }, { status: 400 });
  }

  const { error } = await supabase
    .from('room_members')
    .update({ ready: Boolean(ready) })
    .eq('room_id', id)
    .eq('user_id', session.id);
  if (error) {
    return NextResponse.json({ error: '처리에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
