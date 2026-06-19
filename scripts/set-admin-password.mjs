#!/usr/bin/env node
// 관리자 계정의 비밀번호 해시를 생성해, DB(admins)에 넣을 SQL 을 출력한다.
// 비밀번호는 코드/환경변수에 남기지 않고, 출력된 SQL 을 Supabase SQL Editor 에서 실행한다.
//
// 사용법:
//   node scripts/set-admin-password.mjs <username> <password>
//   npm run set-admin -- <username> <password>
//
// 해시 알고리즘/파라미터는 src/lib/password.ts 와 동일해야 한다(PBKDF2-SHA256).

const ITERATIONS = 100_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, 'binary').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
}

function sqlQuote(s) {
  return `'${String(s).replace(/'/g, "''")}'`;
}

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('사용법: node scripts/set-admin-password.mjs <username> <password>');
  process.exit(1);
}

const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
const hash = await pbkdf2(password, salt, ITERATIONS);
const stored = `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;

console.log('-- Supabase SQL Editor 에서 실행하세요 (007_admins.sql 적용 후):');
console.log(
  `insert into public.admins (username, password_hash)\n` +
    `values (${sqlQuote(username)}, ${sqlQuote(stored)})\n` +
    `on conflict (username) do update set password_hash = excluded.password_hash;`,
);
