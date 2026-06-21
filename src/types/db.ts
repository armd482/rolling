export type RoomState = 'lobby' | 'writing' | 'revealing' | 'finished';
export type RoomMode = 'normal' | 'anonymous';

export type UserRow = {
  id: string;
  name: string;
  nickname: string;
  email: string;
  created_at: string;
};

export type RoomRow = {
  id: number;
  mode: RoomMode;
  state: RoomState;
  current_target_idx: number;
  reveal_page: number;
  phase_ends_at: string | null;
  seconds_per_topic: number | null; // 답변당 제한 시간(초). null = 없음(무제한)
  updated_at: string;
};

export type RoomMemberRow = {
  id: string;
  room_id: number;
  user_id: string;
  joined_at: string;
  last_seen: string | null;
};

export type AssignmentRow = {
  id: string;
  room_id: number;
  target_user_id: string;
  topic_id: number;
  order_idx: number;
  created_at: string;
};

// assignments 조회 시 topics 를 임베드(`select('*, topics(text)')`)한 행.
// topic_id 가 topics(id) 를 참조하는 FK라 to-one 관계로 단일 객체가 따라온다.
export type AssignmentWithTopic = AssignmentRow & { topics: { text: string } | null };

export type MessageRow = {
  id: string;
  assignment_id: string;
  writer_user_id: string;
  content: string;
  created_at: string;
};
