import 'server-only';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export const SESSION_COOKIE = 'rp_session';

export type SessionPayload = {
  id: string; // users.id (uuid)
  email: string;
  nickname: string;
  name: string;
  sid: string; // 이 로그인 고유 식별자 (중복 접속 차단용)
};

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(str: string): Uint8Array {
  const pad = str.length % 4 ? 4 - (str.length % 4) : 0;
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey() {
  const secret = process.env.SESSION_SECRET || 'dev-insecure-secret';
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const sigBytes = fromB64url(sig);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer,
      enc.encode(body),
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(fromB64url(body))) as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

// 쿠키 서명 + "현재 활성 세션인지"까지 검증.
// 같은 계정으로 다른 곳에서 로그인하면 users.active_sid 가 바뀌어 이전 세션은 무효가 된다.
export async function getValidSession(): Promise<SessionPayload | null> {
  const s = await getSession();
  if (!s) return null;
  if (!s.sid) return s; // 구버전 쿠키 호환

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('users')
      .select('active_sid')
      .eq('id', s.id)
      .maybeSingle();
    // active_sid 컬럼이 없거나 조회 실패 시에는 앱을 막지 않음(기능 비활성)
    if (error) return s;
    if (data?.active_sid && data.active_sid !== s.sid) return null;
    return s;
  } catch {
    return s;
  }
}

export function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(email.trim().toLowerCase());
}
