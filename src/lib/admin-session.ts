import 'server-only';

import { cookies } from 'next/headers';

// 일반 사용자 세션(rp_session)과 분리된 관리자 전용 서명 쿠키.
// HMAC-SHA256 으로 서명한다(일반 세션과 동일한 SESSION_SECRET 사용).
export const ADMIN_COOKIE = 'rp_admin';

export type AdminPayload = { username: string };

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

export async function signAdmin(payload: AdminPayload): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

async function verifyAdmin(token: string): Promise<AdminPayload | null> {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const key = await hmacKey();
    const sigBytes = fromB64url(sig);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes.buffer.slice(
        sigBytes.byteOffset,
        sigBytes.byteOffset + sigBytes.byteLength,
      ) as ArrayBuffer,
      enc.encode(body),
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(fromB64url(body))) as AdminPayload;
  } catch {
    return null;
  }
}

// 현재 요청의 관리자 세션 (없으면 null)
export async function getAdminSession(): Promise<AdminPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  return verifyAdmin(token);
}

// 라우트 핸들러에서만 호출 (서버 컴포넌트에서는 쿠키 쓰기 불가)
export async function setAdminCookie(payload: AdminPayload): Promise<void> {
  const token = await signAdmin(payload);
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8시간
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
