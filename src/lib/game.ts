// 주제당 기본 제한 시간(초). 방장이 따로 고르지 않은 방의 기본값(2분).
export const DEFAULT_SECONDS_PER_TOPIC = 120;

// 방장이 고를 수 있는 미리 정의된 제한시간(초). null = 없음(무제한). '기타'는 임의 초.
export const TIME_LIMIT_PRESETS = [null, 120, 300] as const;
// 허용 범위(기타 입력 검증용): 1~60분.
export const MIN_SECONDS_PER_TOPIC = 60;
export const MAX_SECONDS_PER_TOPIC = 3600;

// 작성 단계 전체 마감(안전망)에 더하는 여유 시간(초).
// 각 작성자의 "주제별 120초 타이머"는 서버 시작 시점이 아니라 WritingView 가 마운트된 뒤
// 순차적으로 시작/재설정된다(마운트 지연 + 1초 틱 드리프트). 그래서 마지막 주제의 자동 제출이
// 전체 마감(주제수 × 120초)을 항상 조금 넘겨, 그 카드가 제출되기 전에 단계가 공개로 넘어가
// 누락되는 문제가 있었다. 순차 타이머가 항상 마감 안에 끝나도록 여유를 둔다.
export const WRITING_GRACE_SECONDS = 30;

// 주제 풀(source)에서 중복 없이 n개를 무작위로 뽑는다(Fisher–Yates).
// 주제 텍스트든 id든 풀의 원소 타입 그대로 반환한다.
export function pickTopics<T>(n: number, source: readonly T[]): T[] {
  const pool = [...source];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

// 작성 단계 마감 시각 계산. 각 작성자는 (인원-1)개의 주제를 쓴다.
// secondsPerTopic 이 null(없음/무제한)이면 마감을 두지 않는다(null 반환).
export function writingDeadline(memberCount: number, secondsPerTopic: number | null): string | null {
  if (secondsPerTopic === null) return null;
  const topicsPerWriter = Math.max(1, memberCount - 1);
  const seconds = topicsPerWriter * secondsPerTopic + WRITING_GRACE_SECONDS;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

// 공개 단계 한 페이지의 제한 시간(초). 이 시간이 지나면 자동으로 다음 장으로 넘어간다.
export const REVEAL_STALL_SECONDS = 120;
export function revealDeadline(): string {
  return new Date(Date.now() + REVEAL_STALL_SECONDS * 1000).toISOString();
}
