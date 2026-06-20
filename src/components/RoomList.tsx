'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { RoomState, RoomMode } from '@/types/db';

export type RoomOverview = {
  id: number;
  state: RoomState;
  mode: RoomMode;
  members: { userId: string; nickname: string; isHost: boolean }[];
};

const MAX = 5;

const STATE_LABEL: Record<RoomState, string> = {
  lobby: '대기 중',
  writing: '작성 중',
  revealing: '공개 중',
  finished: '종료',
};

export default function RoomList({
  overview,
  myNickname,
  myRoomId,
}: {
  overview: RoomOverview[];
  myNickname: string;
  myRoomId: number | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // 방/참가자 변경을 실시간 구독 → 서버 컴포넌트 갱신
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('rooms-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members' }, () =>
        router.refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  async function join(roomId: number) {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '입장 실패');
        setBusy(false);
        return;
      }
      // 성공 시 리다이렉트되므로 busy를 유지(버튼 깜빡임 방지)
      router.push(`/rooms/${roomId}`);
    } catch {
      setError('입장 실패');
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-hand text-4xl text-indigo-600">방 선택</h1>
          <p className="text-sm text-gray-500">
            <span className="font-medium text-indigo-600">{myNickname}</span> 님, 입장할 방을 고르세요.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/admin"
            className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            관리자
          </Link>
          <button onClick={logout} className="text-sm text-gray-500 hover:text-gray-800">
            로그아웃
          </button>
        </div>
      </header>

      {error && <p className="mb-4 text-sm text-red-500">{error}</p>}

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.map((room) => {
          const full = room.members.length >= MAX;
          const mine = myRoomId === room.id;
          const inAnyRoom = myRoomId !== null;
          const inProgress = room.state !== 'lobby';
          return (
            <li
              key={room.id}
              className="rounded-xl border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{room.id}번 방</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {STATE_LABEL[room.state]}
                </span>
              </div>

              <div className="mb-4 min-h-[3rem] text-sm text-gray-600 dark:text-gray-300">
                {room.members.length === 0 ? (
                  <span className="text-gray-400">비어 있음</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {room.members.map((m) => (
                      <li
                        key={m.userId}
                        className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                      >
                        {m.nickname}
                        {m.isHost && ' 👑'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {room.members.length} / {MAX}
                </span>
                {mine ? (
                  <button
                    onClick={() => router.push(`/rooms/${room.id}`)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                  >
                    다시 입장
                  </button>
                ) : (
                  <button
                    onClick={() => join(room.id)}
                    disabled={busy || full || inAnyRoom || inProgress}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-gray-100 dark:text-gray-900"
                  >
                    {inProgress ? '진행 중' : full ? '가득 참' : '입장'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
