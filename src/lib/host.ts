// 방장 승계 로직 (접속 여부 기반)
// 원래 방장 = 가장 먼저 입장한 멤버. 그가 오프라인이면 다음으로 먼저 입장한 "접속 중" 멤버가
// 임시로 방장 역할을 한다. 원래 방장이 돌아오면 다시 방장이 된다.

export const ONLINE_THRESHOLD_MS = 15000; // last_seen 이 이 시간 내면 접속 중으로 판정

// 유령(웹을 닫고 떠난) 멤버 정리 기준. 백그라운드 탭의 타이머 스로틀링을 고려해
// 접속 판정(15초)보다 넉넉하게 잡아, 잠깐 비활성인 사용자를 잘못 내보내지 않는다.
export const GHOST_THRESHOLD_MS = 60000;

type MemberLite = { user_id: string; joined_at: string; last_seen: string | null };

function ordered(members: MemberLite[]) {
  return [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

function isOnline(m: MemberLite, nowMs: number, thresholdMs: number) {
  return !!m.last_seen && nowMs - new Date(m.last_seen).getTime() <= thresholdMs;
}

// 서버용: last_seen 기준 유효 방장. 접속자가 없으면 원래 방장(최선두) 반환.
export function effectiveHostId(
  members: MemberLite[],
  nowMs = Date.now(),
  thresholdMs = ONLINE_THRESHOLD_MS,
): string | null {
  const list = ordered(members);
  const online = list.find((m) => isOnline(m, nowMs, thresholdMs));
  return (online ?? list[0])?.user_id ?? null;
}

// 원래 방장(최선두)이 오프라인인지
export function originalHostOffline(
  members: MemberLite[],
  nowMs = Date.now(),
  thresholdMs = ONLINE_THRESHOLD_MS,
): boolean {
  const host = ordered(members)[0];
  return !!host && !isOnline(host, nowMs, thresholdMs);
}

export function originalHostId(members: MemberLite[]): string | null {
  return ordered(members)[0]?.user_id ?? null;
}

// 유령(오프라인) 멤버들의 user_id. last_seen 이 thresholdMs 보다 오래됐거나 없으면 유령으로 본다.
export function staleMemberIds(
  members: MemberLite[],
  nowMs = Date.now(),
  thresholdMs = GHOST_THRESHOLD_MS,
): string[] {
  return members.filter((m) => !isOnline(m, nowMs, thresholdMs)).map((m) => m.user_id);
}
