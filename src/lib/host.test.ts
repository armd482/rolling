import { describe, it, expect } from 'vitest';
import {
  effectiveHostId,
  originalHostOffline,
  originalHostId,
  staleMemberIds,
  ONLINE_THRESHOLD_MS,
  GHOST_THRESHOLD_MS,
} from './host';

const NOW = 1_000_000_000_000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
// joined_at 은 입장 순서만 의미 있으므로 고정 시각에서 순번만 다르게.
const joined = (idx: number) => new Date(NOW - 100_000 + idx * 1000).toISOString();

const member = (id: string, idx: number, lastSeenMsAgo: number | null) => ({
  user_id: id,
  joined_at: joined(idx),
  last_seen: lastSeenMsAgo === null ? null : iso(lastSeenMsAgo),
});

describe('effectiveHostId', () => {
  it('빈 목록이면 null', () => {
    expect(effectiveHostId([], NOW)).toBeNull();
  });

  it('원래 방장(최선두)이 접속 중이면 그가 방장', () => {
    const members = [member('a', 0, 1000), member('b', 1, 1000)];
    expect(effectiveHostId(members, NOW)).toBe('a');
  });

  it('입력 순서가 뒤섞여도 joined_at 최선두 기준으로 판정', () => {
    const members = [member('b', 1, 1000), member('a', 0, 1000)];
    expect(effectiveHostId(members, NOW)).toBe('a');
  });

  it('원래 방장이 오프라인이면 다음으로 먼저 입장한 접속자가 승계', () => {
    const members = [
      member('a', 0, ONLINE_THRESHOLD_MS + 5000), // 오프라인
      member('b', 1, 1000), // 접속 중
      member('c', 2, 1000),
    ];
    expect(effectiveHostId(members, NOW)).toBe('b');
  });

  it('아무도 접속 중이 아니면 원래 방장(최선두)으로 폴백', () => {
    const members = [
      member('a', 0, ONLINE_THRESHOLD_MS + 1),
      member('b', 1, ONLINE_THRESHOLD_MS + 1),
    ];
    expect(effectiveHostId(members, NOW)).toBe('a');
  });

  it('경계값: last_seen 이 정확히 임계치면 접속 중으로 본다', () => {
    const members = [member('a', 0, ONLINE_THRESHOLD_MS)];
    expect(effectiveHostId(members, NOW)).toBe('a');
  });
});

describe('originalHostOffline', () => {
  it('최선두가 접속 중이면 false', () => {
    expect(originalHostOffline([member('a', 0, 1000)], NOW)).toBe(false);
  });
  it('최선두가 오프라인이면 true', () => {
    expect(originalHostOffline([member('a', 0, ONLINE_THRESHOLD_MS + 1)], NOW)).toBe(true);
  });
  it('last_seen 이 null 이면 오프라인', () => {
    expect(originalHostOffline([member('a', 0, null)], NOW)).toBe(true);
  });
});

describe('originalHostId', () => {
  it('항상 joined_at 최선두', () => {
    expect(originalHostId([member('b', 1, 1000), member('a', 0, 1000)])).toBe('a');
  });
  it('빈 목록이면 null', () => {
    expect(originalHostId([])).toBeNull();
  });
});

describe('staleMemberIds', () => {
  it('GHOST 임계치보다 오래됐거나 last_seen 없는 멤버만 유령', () => {
    const members = [
      member('fresh', 0, 1000),
      member('ghost', 1, GHOST_THRESHOLD_MS + 1),
      member('never', 2, null),
    ];
    expect(staleMemberIds(members, NOW).sort()).toEqual(['ghost', 'never']);
  });
});
