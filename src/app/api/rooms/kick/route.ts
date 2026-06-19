import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, targetUserId } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id) || typeof targetUserId !== 'string' || !targetUserId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (targetUserId === session.id) {
    return NextResponse.json({ error: '자기 자신은 강퇴할 수 없습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장(가장 먼저 입장한 멤버)만 강퇴 가능
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });
  const host = members?.[0];
  if (!host || host.user_id !== session.id) {
    return NextResponse.json({ error: '방장만 강퇴할 수 있습니다.' }, { status: 403 });
  }

  await supabase
    .from('room_members')
    .delete()
    .eq('room_id', id)
    .eq('user_id', targetUserId);

  return NextResponse.json({ ok: true });
}
