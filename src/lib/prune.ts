import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { staleMemberIds } from './host';

// 로비(대기) 상태인 방에서 유령(오프라인) 멤버를 제거한다.
// 게임 진행/종료 중에는 이탈 멤버를 유지해야 하므로(방장 승계 설계) 건드리지 않는다.
// 반환값: 제거한 멤버 수.
export async function pruneStaleMembers(
  supabase: SupabaseClient,
  roomId: number,
): Promise<number> {
  const { data: room } = await supabase
    .from('rooms')
    .select('state')
    .eq('id', roomId)
    .maybeSingle();
  if (!room || room.state !== 'lobby') return 0;

  const { data: members } = await supabase
    .from('room_members')
    .select('user_id, joined_at, last_seen')
    .eq('room_id', roomId);
  const all = members ?? [];
  const stale = staleMemberIds(all);
  if (stale.length === 0) return 0;

  const { error } = await supabase
    .from('room_members')
    .delete()
    .eq('room_id', roomId)
    .in('user_id', stale);
  if (error) return 0;

  // 모두 유령이라 방이 비면 초기 상태로 리셋
  if (stale.length >= all.length) {
    await supabase
      .from('rooms')
      .update({ state: 'lobby', current_target_idx: 0, reveal_page: 0, phase_ends_at: null })
      .eq('id', roomId);
  }

  return stale.length;
}
