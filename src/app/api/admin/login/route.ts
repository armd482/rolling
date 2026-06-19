import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { setAdminCookie } from '@/lib/admin-session';

// 관리자 로그인: username/password 를 DB 함수 admin_verify(pgcrypto bcrypt)로 검증한다.
// 해시 비교가 DB 안에서 수행되므로 서버는 평문 비밀번호를 전달만 한다.
export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: ok, error } = await supabase.rpc('admin_verify', {
    p_username: username,
    p_password: password,
  });

  if (error || !ok) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await setAdminCookie({ username });
  return NextResponse.json({ ok: true });
}
