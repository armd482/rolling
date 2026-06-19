'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { RoomState, RoomMode } from '@/types/db';

export type Member = { userId: string; nickname: string; isHost: boolean };
export type ChatMessage = {
  id: string;
  userId: string;
  nickname: string;
  content: string;
};

const STATE_LABEL: Record<RoomState, string> = {
  lobby: '대기 중',
  writing: '작성 중',
  revealing: '공개 중',
  finished: '종료',
};

export default function RoomView({
  roomId,
  state,
  mode,
  myUserId,
  myNickname,
  members,
}: {
  roomId: number;
  state: RoomState;
  mode: RoomMode;
  myUserId: string;
  myNickname: string;
  members: Member[];
}) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [leaving, setLeaving] = useState(false);
  // 준비 상태: Presence 로 동기화 (DB 미사용). userId -> ready
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const me = members.find((m) => m.userId === myUserId);
  const iAmHost = me?.isHost ?? false;
  const myReady = readyMap[myUserId] ?? false;

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-${roomId}`, {
      config: { presence: { key: myUserId }, broadcast: { self: true } },
    });
    channelRef.current = channel;

    const applyPresence = () => {
      const presence = channel.presenceState<{ ready?: boolean }>();
      const map: Record<string, boolean> = {};
      for (const key of Object.keys(presence)) {
        map[key] = Boolean(presence[key]?.[0]?.ready);
      }
      setReadyMap(map);
    };

    channel
      // 멤버십/방장(=DB)·방 상태 변경 → 서버 컴포넌트 갱신
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => router.refresh(),
      )
      // 준비 상태 (Presence)
      .on('presence', { event: 'sync' }, applyPresence)
      // 채팅 (Broadcast, DB 미기록)
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const c = payload as ChatMessage;
        setChats((prev) => (prev.some((m) => m.id === c.id) ? prev : [...prev, c]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.track({ ready: false });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, router, myUserId]);

  // 새 메시지 도착 시 맨 아래로 스크롤
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chats]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !channelRef.current) return;
    setText('');
    channelRef.current.send({
      type: 'broadcast',
      event: 'chat',
      payload: {
        id: crypto.randomUUID(),
        userId: myUserId,
        nickname: myNickname,
        content,
      } satisfies ChatMessage,
    });
  }

  async function toggleReady() {
    await channelRef.current?.track({ ready: !myReady });
  }

  async function leave() {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch('/api/rooms/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      router.push('/rooms');
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{roomId}번 방</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {STATE_LABEL[state]} · {mode === 'anonymous' ? '익명' : '일반'}
          </span>
        </div>
        <button
          onClick={leave}
          disabled={leaving}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          방 나가기
        </button>
      </header>

      {/* 참가자 */}
      <section className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-gray-400">
            참가자 {members.length}/5
          </h2>
          {iAmHost ? (
            <span className="text-xs text-amber-600 dark:text-amber-400">👑 당신이 방장입니다</span>
          ) : (
            <button
              onClick={toggleReady}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                myReady
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                  : 'border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-900'
              }`}
            >
              {myReady ? '✓ 준비 완료 (해제)' : '준비하기'}
            </button>
          )}
        </div>
        <ul className="space-y-1.5">
          {members.map((m) => {
            const ready = readyMap[m.userId] ?? false;
            return (
              <li
                key={m.userId}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                  m.userId === myUserId
                    ? 'bg-indigo-50 dark:bg-indigo-950/50'
                    : 'bg-gray-50 dark:bg-gray-900'
                }`}
              >
                <span className="font-medium">
                  {m.nickname}
                  {m.isHost && ' 👑'}
                  {m.userId === myUserId && ' (나)'}
                </span>
                {m.isHost ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    방장
                  </span>
                ) : ready ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ 준비 완료
                  </span>
                ) : (
                  <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    대기 중
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mb-2 mt-2 border-t border-gray-200 dark:border-gray-800" />

      {/* 채팅 (휘발성 · Broadcast) */}
      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">채팅</h2>
        <div
          ref={scrollRef}
          className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-3 dark:bg-gray-900"
        >
          {chats.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">아직 메시지가 없습니다.</p>
          ) : (
            chats.map((c) => {
              const mine = c.userId === myUserId;
              return (
                <div key={c.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && <span className="mb-0.5 px-1 text-xs text-gray-500">{c.nickname}</span>}
                  <span
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                      mine
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-800 shadow-sm dark:bg-gray-800 dark:text-gray-100'
                    }`}
                  >
                    {c.content}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지를 입력하세요"
            maxLength={500}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="submit"
            disabled={!text.trim()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            전송
          </button>
        </form>
      </section>
    </main>
  );
}
