import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyPassword } from '@/lib/password';
import { setAdminCookie } from '@/lib/admin-session';

// 관리자 로그인: username/password 를 받아 admins 테이블의 해시와 대조한다.
export async function POST(req: Request) {
  const { username, password } = await req.json().catch(() => ({}));
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력하세요.' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: admin } = await supabase
    .from('admins')
    .select('username, password_hash')
    .eq('username', username)
    .maybeSingle();

  const ok = !!admin && (await verifyPassword(password, admin.password_hash));
  if (!ok) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }

  await setAdminCookie({ username: admin!.username });
  return NextResponse.json({ ok: true });
}
