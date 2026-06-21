import { describe, it, expect } from 'vitest';
import { pickTopics, writingDeadline, SECONDS_PER_TOPIC, WRITING_GRACE_SECONDS } from './game';

describe('pickTopics', () => {
  const pool = Array.from({ length: 10 }, (_, i) => `t${i}`);

  it('요청한 개수만큼 반환한다', () => {
    expect(pickTopics(3, pool)).toHaveLength(3);
  });

  it('중복 없이 뽑는다', () => {
    const picked = pickTopics(10, pool);
    expect(new Set(picked).size).toBe(10);
  });

  it('모든 결과가 원본 풀의 원소다', () => {
    for (const t of pickTopics(5, pool)) expect(pool).toContain(t);
  });

  it('원본 풀을 변형하지 않는다(불변)', () => {
    const snapshot = [...pool];
    pickTopics(5, pool);
    expect(pool).toEqual(snapshot);
  });

  it('n 이 풀 크기보다 크면 풀 전체(개수만큼)만 반환', () => {
    expect(pickTopics(99, pool)).toHaveLength(pool.length);
  });

  it('id(number) 풀도 그대로 동작한다', () => {
    const ids = [1, 2, 3, 4, 5];
    const picked = pickTopics(2, ids);
    expect(picked).toHaveLength(2);
    for (const id of picked) expect(ids).toContain(id);
  });
});

describe('writingDeadline', () => {
  it('미래 시각(ISO)을 반환한다', () => {
    const t = new Date(writingDeadline(4)).getTime();
    expect(t).toBeGreaterThan(Date.now());
  });

  it('작성할 주제 수((인원-1))에 비례해 길어진다', () => {
    const before = Date.now();
    const five = new Date(writingDeadline(5)).getTime() - before;
    const three = new Date(writingDeadline(3)).getTime() - before;
    // (5-1)개 vs (3-1)개 → 2개 분량 차이만큼 더 길어야 한다(타이밍 오차 여유).
    expect(five - three).toBeGreaterThanOrEqual(2 * SECONDS_PER_TOPIC * 1000 - 1500);
  });

  it('인원 1명 이하라도 최소 1개 주제 분량은 확보', () => {
    const before = Date.now();
    const ms = new Date(writingDeadline(1)).getTime() - before;
    expect(ms).toBeGreaterThanOrEqual((SECONDS_PER_TOPIC + WRITING_GRACE_SECONDS) * 1000 - 1500);
  });
});
