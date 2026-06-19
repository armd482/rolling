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
  current_round: number;
  current_target_idx: number;
  reveal_page: number;
  phase_ends_at: string | null;
  updated_at: string;
};

export type RoomMemberRow = {
  id: string;
  room_id: number;
  user_id: string;
  joined_at: string;
};

export type AssignmentRow = {
  id: string;
  room_id: number;
  round: number;
  target_user_id: string;
  topic: string;
  order_idx: number;
  created_at: string;
};

export type MessageRow = {
  id: string;
  assignment_id: string;
  writer_user_id: string;
  content: string;
  created_at: string;
};
