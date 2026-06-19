import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import type { RoomMode } from '@/types/db';

const MODES: RoomMode[] = ['normal', 'anonymous'];

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, mode } = await req.json().catch(() => ({ roomId: null, mode: null }));
  const id = Number(roomId);
  if (!Number.isInteger(id) || !MODES.includes(mode)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장(가장 먼저 입장한 멤버)만 변경 가능
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });
  const host = members?.[0];
  if (!host || host.user_id !== session.id) {
    return NextResponse.json({ error: '방장만 변경할 수 있습니다.' }, { status: 403 });
  }

  const { error } = await supabase.from('rooms').update({ mode }).eq('id', id);
  if (error) {
    return NextResponse.json({ error: '변경에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
