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

const MAX = 7;

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
  const [joiningId, setJoiningId] = useState<number | null>(null);
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
    setJoiningId(roomId);
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
        setJoiningId(null);
        return;
      }
      // 성공 시 리다이렉트되므로 busy를 유지(버튼 깜빡임 방지)
      router.push(`/rooms/${roomId}`);
    } catch {
      setError('입장 실패');
      setBusy(false);
      setJoiningId(null);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
    router.refresh();
  }

  const STATE_THEME: Record<RoomState, { text: string; bg: string; border: string; dot: string; pulse?: boolean }> = {
    lobby: { text: '대기 중', bg: 'bg-emerald-50/80 text-emerald-700', border: 'border-emerald-200/50', dot: 'bg-emerald-500' },
    writing: { text: '작성 중', bg: 'bg-blue-50 text-blue-700', border: 'border-blue-200/50', dot: 'bg-blue-500', pulse: true },
    revealing: { text: '공개 중', bg: 'bg-indigo-50 text-indigo-700', border: 'border-indigo-200/50', dot: 'bg-indigo-500', pulse: true },
    finished: { text: '종료', bg: 'bg-gray-100/80 text-gray-600', border: 'border-gray-300/40', dot: 'bg-gray-400' },
  };

  return (
    <main className="relative mx-auto min-h-screen w-full max-w-6xl px-6 py-12 sm:px-8 lg:px-10">
      {/* 장식용 오로라 블러 배경 */}
      <div className="pointer-events-none absolute -top-40 right-20 h-96 w-96 rounded-full bg-violet-200/30 blur-3xl" />
      <div className="pointer-events-none absolute top-80 -left-20 h-96 w-96 rounded-full bg-rose-200/30 blur-3xl" />

      <header className="relative z-10 mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            방 선택하기
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            <span className="font-semibold text-rose-500">@{myNickname}</span> 님, 마음에 드는 방에 들어가 마음을 나눠보세요.
          </p>
        </div>
        <div className="flex items-center gap-5">
          <Link
            href="/admin"
            className="text-xs font-semibold uppercase tracking-wider text-gray-400 transition hover:text-rose-500"
          >
            관리자 모드
          </Link>
          <button
            onClick={logout}
            aria-label="로그아웃"
            className="rounded-xl border border-rose-200/50 bg-rose-50/40 px-3.5 py-1.5 text-xs font-semibold text-rose-600 backdrop-blur-sm transition hover:bg-rose-500 hover:text-white"
          >
            로그아웃
          </button>
        </div>
      </header>

      {error && (
        <div className="relative z-10 mb-6 flex items-center gap-2 rounded-2xl bg-rose-50/80 px-4 py-3 text-sm text-rose-700 border border-rose-100 backdrop-blur-sm">
          <span>{error}</span>
        </div>
      )}

      <ul className="relative z-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {overview.map((room) => {
          const full = room.members.length >= MAX;
          const mine = myRoomId === room.id;
          const inAnyRoom = myRoomId !== null;
          const inProgress = room.state !== 'lobby';
          const theme = STATE_THEME[room.state];

          return (
            <li
              key={room.id}
              className={`rounded-3xl glass-card flex flex-col justify-between p-6 transition ${
                mine
                  ? 'ring-2 ring-blue-400/50 bg-white/70'
                  : inAnyRoom || full || inProgress
                    ? 'opacity-55'
                    : ''
              }`}
            >
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-xl font-bold tracking-tight text-gray-800">
                    {room.id}번 방
                  </h2>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border backdrop-blur-md ${theme.bg} ${theme.border}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                    {theme.text}
                  </span>
                </div>

                <div className="mb-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2.5">
                    참가자 목록
                  </h3>
                  <div className="min-h-[3.5rem]">
                    {room.members.length === 0 ? (
                      <span className="inline-block text-xs font-medium text-gray-400 italic bg-gray-50/50 px-2.5 py-1.5 rounded-xl border border-gray-100">
                        방이 비어 있습니다.
                      </span>
                    ) : (
                      <ul className="flex flex-wrap gap-1.5">
                        {room.members.map((m) => (
                          <li
                            key={m.userId}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border ${
                              m.isHost 
                                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                : 'bg-rose-50/50 text-rose-700 border-rose-100'
                            }`}
                          >
                            {m.isHost && <span className="font-semibold">방장</span>}
                            <span className="font-semibold">{m.nickname}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div>
                {/* 진행률 바 형태의 인원 수 표시 */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs font-bold text-gray-400 mb-1">
                    <span>인원수</span>
                    <span className={full ? 'text-rose-500' : 'text-gray-500'}>
                      {room.members.length} / {MAX} 명
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        full ? 'bg-gray-400' : 'bg-blue-500'
                      }`}
                      style={{ width: `${(room.members.length / MAX) * 100}%` }}
                    />
                  </div>
                </div>

                {mine ? (
                  <button
                    onClick={() => router.push(`/rooms/${room.id}`)}
                    aria-label={`${room.id}번 방으로 다시 입장`}
                    disabled={busy}
                    className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
                  >
                    다시 입장하기
                  </button>
                ) : (
                  (() => {
                    const isJoining = joiningId === room.id;
                    const disabled = busy || full || inAnyRoom || inProgress;
                    return (
                      <button
                        onClick={() => join(room.id)}
                        aria-label={`${room.id}번 방 입장`}
                        disabled={disabled}
                        aria-busy={isJoining}
                        className={`w-full rounded-2xl py-3 text-sm font-bold text-white transition-all ${
                          isJoining
                            ? 'bg-gray-900 opacity-80 cursor-wait'
                            : disabled
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed border border-gray-300/20'
                              : 'bg-gray-900 hover:bg-gray-800 hover:scale-[1.01] active:scale-[0.99] shadow-md shadow-gray-200'
                        }`}
                      >
                        {isJoining
                          ? '입장 중…'
                          : inAnyRoom
                            ? '다른 방 참여 중'
                            : inProgress
                              ? '게임 진행 중'
                              : full
                                ? '정원 초과'
                                : '입장하기'}
                      </button>
                    );
                  })()
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}

