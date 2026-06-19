import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_LEN = 500;

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, content } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  const text = String(content ?? '').trim();

  if (!Number.isInteger(id) || id < 1 || id > 7) {
    return NextResponse.json({ error: '잘못된 방입니다.' }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: '내용이 비어 있습니다.' }, { status: 400 });
  if (text.length > MAX_LEN) {
    return NextResponse.json({ error: `최대 ${MAX_LEN}자까지 가능합니다.` }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 해당 방의 참가자만 채팅 가능
  const { data: member } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: '방에 입장한 사용자만 채팅할 수 있습니다.' }, { status: 403 });
  }

  const { error } = await supabase.from('room_chats').insert({
    room_id: id,
    user_id: session.id,
    nickname: session.nickname,
    content: text,
  });
  if (error) {
    return NextResponse.json({ error: '전송에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
