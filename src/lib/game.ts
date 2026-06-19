import { TOPICS } from './topics';

// 주제당 제한 시간(초). 작성 단계 총 시간 = (작성할 주제 수) × 이 값.
export const SECONDS_PER_TOPIC = 120;

// 중복 없이 n개의 주제를 무작위로 뽑는다.
export function pickTopics(n: number): string[] {
  const pool = [...TOPICS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// 작성 단계 마감 시각 계산. 각 작성자는 (인원-1)개의 주제를 쓴다.
export function writingDeadline(memberCount: number): string {
  const topicsPerWriter = Math.max(1, memberCount - 1);
  return new Date(Date.now() + topicsPerWriter * SECONDS_PER_TOPIC * 1000).toISOString();
}
