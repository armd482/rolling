import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { effectiveHostId } from '@/lib/host';
import { MIN_SECONDS_PER_TOPIC, MAX_SECONDS_PER_TOPIC } from '@/lib/game';

// 답변(주제)당 제한 시간 설정. null = 없음(무제한), 그 외엔 1~60분(초) 정수.
// 로비에서 방장이 바꾸며, broadcast 로 즉시 공유되고 여기서 DB 에 영속(late-join 대비)한다.
export async function POST(req: Request) {
  const session = await getValidSession();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });

  const { roomId, secondsPerTopic } = await req
    .json()
    .catch(() => ({ roomId: null, secondsPerTopic: null }));
  const id = Number(roomId);

  // null(없음) 이거나, 허용 범위 내 정수여야 한다.
  const valid =
    secondsPerTopic === null ||
    (Number.isInteger(secondsPerTopic) &&
      secondsPerTopic >= MIN_SECONDS_PER_TOPIC &&
      secondsPerTopic <= MAX_SECONDS_PER_TOPIC);
  if (!Number.isInteger(id) || !valid) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 방장(현재 접속 중인 유효 방장)만 변경 가능
  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at, last_seen')
    .eq('room_id', id)
    .order('joined_at', { ascending: true });
  if (effectiveHostId(members ?? []) !== session.id) {
    return NextResponse.json({ error: '방장만 변경할 수 있습니다.' }, { status: 403 });
  }

  const { error } = await supabase
    .from('rooms')
    .update({ seconds_per_topic: secondsPerTopic })
    .eq('id', id);
  if (error) {
    return NextResponse.json({ error: '변경에 실패했습니다.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
