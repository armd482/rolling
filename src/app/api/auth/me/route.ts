import { NextResponse } from 'next/server';
import { getValidSession } from '@/lib/session';

// 현재 세션이 여전히 유효한 활성 세션인지 확인한다.
export async function GET() {
  const session = await getValidSession();
  if (!session) {
    return NextResponse.json({ error: 'invalid' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, nickname: session.nickname });
}
