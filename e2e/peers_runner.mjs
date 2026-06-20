// 수동 멀티유저 테스트용 피어 러너: 제이크/루디를 실제 브라우저 세션(독립 쿠키)으로 띄워
// 입장→준비→(연속 채팅)→[긴 답변] 작성 제출 후, 방장이 공개/종료 진행 동안 세션 유지.
import { chromium } from '@playwright/test';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const ROOM = Number(process.env.E2E_ROOM ?? 7);
const PEERS = [
  { email: 'kde2800623@gmail.com', nick: '제이크' },
  { email: 'sunwoo005@gmail.com', nick: '루디' },
];

// 긴 답변 생성기(레이아웃 스트레스용, 약 400자+)
function longAnswer(nick, q) {
  const base = `[${nick}의 답변 ${q + 1}] 함께한 시간을 하나하나 떠올려 보면 정말 고마운 순간이 너무 많았어요. `;
  const body = '바쁜 와중에도 늘 먼저 챙겨주고, 힘들 때 곁에서 묵묵히 도와준 덕분에 큰 힘이 되었습니다. '.repeat(4);
  const tail = '\n\n앞으로도 지금처럼 따뜻하고 멋진 사람으로 남아주길 진심으로 응원할게요. 늘 고맙고, 또 고맙습니다! 🎉';
  return base + body + tail;
}

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const browser = await chromium.launch({ headless: true });

async function setupPeer(p) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  await page.goto(BASE + '/');
  await page.getByLabel('이메일 주소').fill(p.email);
  await page.getByLabel('이메일 주소').press('Escape');
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL(/\/rooms/);
  await page.goto(BASE + '/rooms');
  await page.getByRole('button', { name: `${ROOM}번 방 입장` }).click();
  await page.waitForURL(new RegExp(`/rooms/${ROOM}(\\b|/|$)`));
  await page.getByRole('button', { name: '준비 상태 전환' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1800);
  await page.getByRole('button', { name: '준비 상태 전환' }).click();
  log(`${p.nick} 입장+준비 완료`);
  return { page, ctx, ...p };
}

const peers = [];
for (const p of PEERS) peers.push(await setupPeer(p));

try {
  const chat = peers[0].page.getByLabel('채팅 메시지 입력');
  for (const m of ['안녕하세요! 제이크입니다 👋','연속 메시지 1 — 이름 중복 안 나와야 함','연속 메시지 2 — 같은 사람이 또 보냄']) {
    await chat.fill(m); await chat.press('Enter'); await peers[0].page.waitForTimeout(450);
  }
  log('제이크 로비 연속 채팅 3개 전송');
} catch (e) { log('채팅 전송 실패', e.message); }

console.log('PEERS_READY');

for (const pe of peers) await pe.page.getByText('이 질문 남은 시간').waitFor({ timeout: 240000 });
console.log('WRITING_STARTED');

for (const pe of peers) {
  for (let q = 0; q < 2; q++) {
    const input = pe.page.getByLabel('답변 입력');
    await input.waitFor({ timeout: 20000 });
    await input.fill(longAnswer(pe.nick, q));
    await pe.page.getByRole('button', { name: '제출' }).click();
    await pe.page.waitForTimeout(800);
  }
  log(`${pe.nick} 긴 답변 2개 제출 완료`);
}
console.log('PEERS_WROTE');

console.log('PEERS_LIVE_HOLDING');
await new Promise((r) => setTimeout(r, 12 * 60 * 1000));
await browser.close();
console.log('PEERS_DONE');
