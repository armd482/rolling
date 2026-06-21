import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';

// .env.local 을 읽어 process.env 에 채운다(Playwright 는 자동 로드하지 않음).
function loadEnvLocal() {
  try {
    const text = readFileSync('.env.local', 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || line.trimStart().startsWith('#')) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* .env.local 없으면 무시 */
  }
}

export function service(): SupabaseClient {
  loadEnvLocal();
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// 화이트리스트 테스트 유저(입장 순서 = 배열 순서 → [0]이 방장)
export const TEST_USERS = [
  { email: 'mathasdf0@gmail.com', nickname: '시오' },
  { email: 'kde2800623@gmail.com', nickname: '제이크' },
  { email: 'sunwoo005@gmail.com', nickname: '루디' },
];

// 테스트 방과 테스트 유저들을 깨끗한 초기 상태로 되돌린다(다른 방 멤버십 포함).
export async function resetTestRoom(roomId: number) {
  const sb = service();
  const { data: users } = await sb
    .from('users')
    .select('id')
    .in('email', TEST_USERS.map((u) => u.email));
  const ids = (users ?? []).map((u) => u.id);
  if (ids.length) await sb.from('room_members').delete().in('user_id', ids);

  const { data: asn } = await sb.from('assignments').select('id').eq('room_id', roomId);
  const aids = (asn ?? []).map((a) => a.id);
  if (aids.length) await sb.from('messages').delete().in('assignment_id', aids);
  await sb.from('assignments').delete().eq('room_id', roomId);
  await sb.from('room_members').delete().eq('room_id', roomId);
  const { error } = await sb
    .from('rooms')
    .update({
      state: 'lobby',
      mode: 'anonymous',
      current_target_idx: 0,
      reveal_page: 0,
      phase_ends_at: null,
      seconds_per_topic: 120,
    })
    .eq('id', roomId);
  // 조용히 묻히면 방이 비-lobby 로 남아 다음 테스트 입장을 막는다 → 실패를 드러낸다.
  if (error) throw new Error(`resetTestRoom: rooms 리셋 실패 — ${error.message}`);
}

// 이메일 로그인 후 /rooms* 까지 진입
export async function login(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('이메일 주소').fill(email);
  await page.getByLabel('이메일 주소').press('Escape');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL(/\/rooms/);
}

// 로그인 후 지정 방으로 입장(이미 방에 들어가 있으면 /rooms 로 빠져나와 입장)
export async function loginAndJoin(page: Page, email: string, roomId: number) {
  await login(page, email);
  await page.goto('/rooms');
  await expect(page.getByRole('button', { name: `${roomId}번 방 입장` })).toBeEnabled({
    timeout: 15000,
  });
  await page.getByRole('button', { name: `${roomId}번 방 입장` }).click();
  await page.waitForURL(new RegExp(`/rooms/${roomId}(\\b|/|$)`));
}
