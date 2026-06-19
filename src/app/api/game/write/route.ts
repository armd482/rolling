import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, targetUserId, content } = await req.json().catch(() => ({}));
  const id = Number(roomId);
  if (!Number.isInteger(id) || typeof targetUserId !== 'string' || !targetUserId) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }
  if (targetUserId === session.id) {
    return NextResponse.json({ error: '자기 자신에게는 작성할 수 없습니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 작성 단계인지 + 마감 전인지
  const { data: room } = await supabase
    .from('rooms')
    .select('state, current_round, phase_ends_at')
    .eq('id', id)
    .maybeSingle();
  if (!room || room.state !== 'writing') {
    return NextResponse.json({ error: '작성 단계가 아닙니다.' }, { status: 409 });
  }
  if (room.phase_ends_at && Date.now() > new Date(room.phase_ends_at).getTime()) {
    return NextResponse.json({ error: '작성 시간이 종료되었습니다.' }, { status: 409 });
  }

  // 방 멤버인지
  const { data: mem } = await supabase
    .from('room_members')
    .select('id')
    .eq('room_id', id)
    .eq('user_id', session.id)
    .maybeSingle();
  if (!mem) {
    return NextResponse.json({ error: '방 참가자가 아닙니다.' }, { status: 403 });
  }

  // 대상의 주제 배정 찾기
  const { data: assignment } = await supabase
    .from('assignments')
    .select('id')
    .eq('room_id', id)
    .eq('round', room.current_round)
    .eq('target_user_id', targetUserId)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ error: '대상 주제를 찾을 수 없습니다.' }, { status: 400 });
  }

  const text = String(content ?? '').slice(0, 2000);
  const { error } = await supabase
    .from('messages')
    .upsert(
      { assignment_id: assignment.id, writer_user_id: session.id, content: text },
      { onConflict: 'assignment_id,writer_user_id' },
    );
  if (error) {
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
