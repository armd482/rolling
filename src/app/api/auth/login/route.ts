import { NextResponse } from 'next/server';
import { findUserByEmail } from '@/lib/users';
import { createAdminClient } from '@/lib/supabase/admin';
import { SESSION_COOKIE, signSession } from '@/lib/session';

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({ email: '' }));

  const whitelisted = findUserByEmail(String(email || ''));
  if (!whitelisted) {
    return NextResponse.json(
      { error: '등록되지 않은 이메일입니다.' },
      { status: 401 },
    );
  }

  // DB users 테이블에서 id 확보 (없으면 생성)
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from('users')
    .select('id, name, nickname, email')
    .eq('email', whitelisted.email)
    .maybeSingle();

  let row = existing;
  if (!row) {
    const { data: inserted, error } = await supabase
      .from('users')
      .insert({
        name: whitelisted.name,
        nickname: whitelisted.nickname,
        email: whitelisted.email,
      })
      .select('id, name, nickname, email')
      .single();
    if (error) {
      return NextResponse.json({ error: '로그인 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }
    row = inserted;
  }

  // 이 로그인 고유 sid 발급 → DB에 활성 세션으로 기록(last-wins).
  // 같은 계정으로 다시 로그인하면 active_sid 가 갱신되어 이전 접속은 무효가 된다.
  const sid = crypto.randomUUID();
  await supabase.from('users').update({ active_sid: sid }).eq('id', row!.id);

  const token = await signSession({
    id: row!.id,
    email: row!.email,
    nickname: row!.nickname,
    name: row!.name,
    sid,
  });

  const res = NextResponse.json({
    user: { id: row!.id, nickname: row!.nickname, name: row!.name, email: row!.email },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
