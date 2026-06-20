// 클라이언트(RoomView)로 전달되는 게임 데이터 (작성/공개 공용)
export type GameTarget = {
  assignmentId: string;
  userId: string;
  nickname: string;
  topic: string;
  orderIdx: number;
};

export type RevealMessage = {
  // 익명 모드면 null
  writerNickname: string | null;
  content: string;
};

export type GameData = {
  targets: GameTarget[]; // order_idx 오름차순
  // 작성 단계: 내가 쓴 내용 (assignmentId -> content)
  myMessages: Record<string, string>;
  // 작성 단계: 참가자별 완료 여부
  progress: { userId: string; nickname: string; done: boolean }[];
  // 공개 단계: assignmentId -> 메시지 목록
  messagesByAssignment: Record<string, RevealMessage[]>;
};
