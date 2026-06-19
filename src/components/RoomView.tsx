'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { RoomState, RoomMode } from '@/types/db';
import type { GameData } from '@/types/game';
import WritingView from '@/components/game/WritingView';
import RevealView from '@/components/game/RevealView';
import FinishedView from '@/components/game/FinishedView';

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

const MODE_OPTIONS: { value: RoomMode; label: string; desc: string }[] = [
  {
    value: 'anonymous',
    label: '익명 모드',
    desc: '작성자가 누구인지 숨긴 채 내용을 보여줍니다.',
  },
  {
    value: 'normal',
    label: '실명 모드',
    desc: '작성자의 이름이 표시됩니다. 누가 어떤 말을 남겼는지 알 수 있어요.',
  },
];

export default function RoomView({
  roomId,
  state,
  mode,
  currentTargetIdx,
  revealPage,
  phaseEndsAt,
  myUserId,
  myNickname,
  members,
  game,
}: {
  roomId: number;
  state: RoomState;
  mode: RoomMode;
  currentTargetIdx: number;
  revealPage: number;
  phaseEndsAt: string | null;
  myUserId: string;
  myNickname: string;
  members: Member[];
  game: GameData | null;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  // 준비 상태: Presence 로 동기화 (DB 미사용). userId -> ready
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  // 공개 모드: DB(rooms.mode) 영속 + broadcast 즉시 동기화
  const [selectedMode, setSelectedMode] = useState<RoomMode>(mode);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 준비 상태를 broadcast 로 동기화. 새 참가자 입장 시 재전송하기 위해 ref 로 최신값 보관
  const myReadyRef = useRef(false);

  const me = members.find((m) => m.userId === myUserId);
  const iAmHost = me?.isHost ?? false;
  const myReady = readyMap[myUserId] ?? false;
  const gameInProgress = state === 'writing' || state === 'revealing';

  // 하트비트 인터벌(고정 deps) 안에서 최신 방장/상태 값을 읽기 위한 ref
  const pruneRef = useRef({ iAmHost, state });
  pruneRef.current = { iAmHost, state };

  // 시작 가능 조건: 총 3명 이상이고, 방장 외 참가자 전원이 준비 완료
  const others = members.filter((m) => !m.isHost);
  const readyCount = others.filter((m) => readyMap[m.userId] ?? false).length;
  const allReady = members.length >= 3 && readyCount === others.length;

  // 비활성 사유 (방장에게 안내)
  const startDisabledReason =
    members.length < 3
      ? `시작하려면 ${3 - members.length}명 더 필요해요 · 현재 ${members.length}명 (최소 3명)`
      : readyCount < others.length
        ? `아직 준비하지 않은 참가자가 있어요 · ${readyCount}/${others.length}명 준비 완료`
        : null;

  // 서버 갱신으로 prop(mode)이 바뀌면 로컬 상태도 맞춤
  useEffect(() => {
    setSelectedMode(mode);
  }, [mode]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase.channel(`room-${roomId}`, {
      config: { broadcast: { self: true } },
    });
    channelRef.current = channel;

    const announceReady = () => {
      channel.send({
        type: 'broadcast',
        event: 'ready',
        payload: { userId: myUserId, ready: myReadyRef.current },
      });
    };

    channel
      // 멤버십(입장/퇴장/강퇴/이탈) 변경 → 서버 컴포넌트 갱신
      // DELETE 는 기본 replica identity(PK만)라 페이로드에 room_id 가 없어 필터가 매칭되지 않는다.
      // 따라서 필터 없이 모든 room_members 변경을 수신하고, 갱신은 서버에서 roomId 로 스코프한다.
      // UPDATE(=하트비트 last_seen)는 제외한다 — 매 하트비트마다 전원이 새로고침되는 폭주를 막기 위함.
      // 시간 경과에 따른 유효 방장 변경은 아래 주기적 새로고침이 처리한다.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_members' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'room_members' },
        () => router.refresh(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => router.refresh(),
      )
      // 게임 배정·메시지 변경 → 서버 컴포넌트 갱신 (작성 현황/공개 내용 실시간 반영)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, () =>
        router.refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () =>
        router.refresh(),
      )
      // 준비 상태 (Broadcast) — presence 재track 은 타 클라이언트 전파가 불안정해 broadcast 사용
      .on('broadcast', { event: 'ready' }, ({ payload }) => {
        const p = payload as { userId: string; ready: boolean };
        setReadyMap((prev) => ({ ...prev, [p.userId]: p.ready }));
      })
      // 신규 입장자의 상태 요청 → 자기 준비 상태를 재전송 (late-join 동기화)
      .on('broadcast', { event: 'ready-request' }, announceReady)
      // 공개 모드 변경 (방장 → 전체) 즉시 동기화
      .on('broadcast', { event: 'mode' }, ({ payload }) => {
        setSelectedMode((payload as { mode: RoomMode }).mode);
      })
      // 강퇴 알림: 내가 대상이면 알림 후 방 목록으로
      .on('broadcast', { event: 'kick' }, ({ payload }) => {
        if ((payload as { userId: string }).userId !== myUserId) return;
        window.alert('방장에 의해 강퇴되었습니다.');
        router.push('/rooms');
      })
      // 채팅 (Broadcast, DB 미기록)
      .on('broadcast', { event: 'chat' }, ({ payload }) => {
        const c = payload as ChatMessage;
        setChats((prev) => (prev.some((m) => m.id === c.id) ? prev : [...prev, c]));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // 입장 시: 내 상태 알리고(announce) + 기존 참가자 상태 요청(request)
          announceReady();
          channel.send({ type: 'broadcast', event: 'ready-request', payload: {} });
        }
      });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [roomId, router, myUserId]);

  // 접속 유지(하트비트) + 주기적 새로고침
  // - 하트비트: last_seen 을 갱신해 "접속 중"으로 유지(방장 승계 판정 기준).
  // - 새로고침: 시간이 지나 바뀌는 유효 방장(원래 방장이 자리를 비우면 다음 멤버로 승계,
  //   돌아오면 원복)을 서버 컴포넌트가 다시 계산하도록 한다.
  useEffect(() => {
    const beat = () => {
      fetch('/api/rooms/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      }).catch(() => {});
    };
    beat();
    const timer = setInterval(() => {
      beat();
      router.refresh();
      // 로비에서는 방장이 유령(웹 닫고 떠난) 멤버를 정리한다.
      if (pruneRef.current.iAmHost && pruneRef.current.state === 'lobby') {
        fetch('/api/rooms/prune', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId }),
        }).catch(() => {});
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [roomId, router]);

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

  function toggleReady() {
    const next = !myReady;
    myReadyRef.current = next;
    // 낙관적 업데이트 + 전체에 broadcast (self:true 라 본인에게도 되돌아옴, 동일값이라 무해)
    setReadyMap((prev) => ({ ...prev, [myUserId]: next }));
    channelRef.current?.send({
      type: 'broadcast',
      event: 'ready',
      payload: { userId: myUserId, ready: next },
    });
  }

  function changeMode(next: RoomMode) {
    if (!iAmHost || next === selectedMode) return;
    setSelectedMode(next); // 낙관적
    channelRef.current?.send({ type: 'broadcast', event: 'mode', payload: { mode: next } });
    // DB 영속(late-join 대비) — 실패해도 broadcast 로 즉시 반영은 됨
    fetch('/api/rooms/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, mode: next }),
    });
  }

  async function start() {
    if (!iAmHost || !allReady || starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        window.alert(d.error ?? '시작에 실패했습니다.');
      }
      // 성공 시 rooms UPDATE 구독 → router.refresh → 작성 화면으로 전환
    } finally {
      setStarting(false);
    }
  }

  // 작성 내용 저장
  const writeMessage = useCallback(
    (targetUserId: string, content: string) => {
      fetch('/api/game/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, targetUserId, content }),
      });
    },
    [roomId],
  );

  // 작성 → 공개 전환 요청 (마감/전원완료 시). 서버가 조건 검증 후 1회만 적용.
  const toRevealSentRef = useRef(false);
  const requestToReveal = useCallback(() => {
    if (toRevealSentRef.current) return;
    toRevealSentRef.current = true;
    fetch('/api/game/to-reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
  }, [roomId]);

  // 작성 단계가 아니면 전환요청 가드 초기화
  useEffect(() => {
    if (state !== 'writing') toRevealSentRef.current = false;
  }, [state]);

  // 전원 작성 완료 시 자동으로 공개 단계 전환 요청
  useEffect(() => {
    if (
      state === 'writing' &&
      game &&
      game.progress.length > 0 &&
      game.progress.every((p) => p.done)
    ) {
      requestToReveal();
    }
  }, [state, game, requestToReveal]);

  function revealNav(dir: 'next' | 'prev') {
    fetch('/api/game/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, dir }),
    });
  }

  function resetGame() {
    fetch('/api/game/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    });
  }

  async function kick(targetUserId: string) {
    const res = await fetch('/api/rooms/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, targetUserId }),
    });
    if (!res.ok) return;
    // 강퇴 대상에게 즉시 알림(broadcast). DB DELETE 구독보다 빠르고 대상을 특정할 수 있다.
    channelRef.current?.send({
      type: 'broadcast',
      event: 'kick',
      payload: { userId: targetUserId },
    });
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
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-8 lg:px-10">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{roomId}번 방</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {STATE_LABEL[state]} · {mode === 'anonymous' ? '익명' : '일반'}
          </span>
        </div>
        <button
          onClick={leave}
          disabled={leaving || gameInProgress}
          title={gameInProgress ? '게임 진행 중에는 나갈 수 없습니다.' : undefined}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-900"
        >
          방 나가기
        </button>
      </header>

      {state === 'writing' && game ? (
        <WritingView
          targets={game.targets}
          myMessages={game.myMessages}
          myUserId={myUserId}
          phaseEndsAt={phaseEndsAt}
          progress={game.progress}
          onWrite={writeMessage}
          onTimeUp={requestToReveal}
        />
      ) : state === 'revealing' && game ? (
        <RevealView
          targets={game.targets}
          messagesByAssignment={game.messagesByAssignment}
          currentTargetIdx={currentTargetIdx}
          revealPage={revealPage}
          phaseEndsAt={phaseEndsAt}
          iAmHost={iAmHost}
          onNav={revealNav}
        />
      ) : state === 'finished' && game ? (
        <FinishedView
          targets={game.targets}
          messagesByAssignment={game.messagesByAssignment}
          iAmHost={iAmHost}
          onReset={resetGame}
        />
      ) : (
        <>
      {/* 참가자 */}
      <section className="mb-6 flex-1">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
            참가자 {members.length}/5
          </h2>
          {iAmHost ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-3">
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  👑 당신이 방장입니다
                </span>
                <button
                  onClick={start}
                  disabled={!allReady || starting}
                  className={`whitespace-nowrap rounded-lg px-5 py-2 text-sm font-semibold leading-none shadow-sm transition ${
                    allReady && !starting
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-[0.98]'
                      : 'cursor-not-allowed bg-gray-200 text-gray-400 shadow-none dark:bg-gray-800 dark:text-gray-500'
                  }`}
                >
                  {starting ? '시작 중…' : '시작하기'}
                </button>
              </div>
              {startDisabledReason && (
                <p className="text-right text-xs text-red-500">⚠ {startDisabledReason}</p>
              )}
            </div>
          ) : (
            <button
              onClick={toggleReady}
              className={`whitespace-nowrap rounded-lg px-5 py-2 text-sm font-semibold leading-none text-white shadow-sm transition ${
                myReady
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {myReady ? '✓ 준비 완료 (클릭해 해제)' : '준비하기'}
            </button>
          )}
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => {
            const ready = readyMap[m.userId] ?? false;
            const isMe = m.userId === myUserId;
            return (
              <li
                key={m.userId}
                className={`flex flex-col gap-3 rounded-xl border p-4 ${
                  isMe
                    ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/50'
                    : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {m.nickname}
                    {m.isHost && ' 👑'}
                  </span>
                  {isMe ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                      나
                    </span>
                  ) : iAmHost && !m.isHost ? (
                    <button
                      onClick={() => kick(m.userId)}
                      className="rounded-md border border-red-200 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/50"
                    >
                      강퇴
                    </button>
                  ) : null}
                </div>
                {m.isHost ? (
                  <span className="w-fit rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    방장
                  </span>
                ) : ready ? (
                  <span className="w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    ✓ 준비 완료
                  </span>
                ) : (
                  <span className="w-fit rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    대기 중
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-auto flex flex-col gap-4">
        {/* 공개 모드 선택 (방장만 변경 가능, 참가자는 열람) — 채팅창과 동일 높이 */}
        <section className="flex h-72 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2 dark:border-gray-800">
            <h2 className="text-xs font-medium uppercase tracking-wide text-gray-400">공개 모드</h2>
            <span className="text-xs text-gray-400">
              {iAmHost ? '방장이 선택합니다' : '방장이 선택한 모드입니다'}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {MODE_OPTIONS.map((opt) => {
              const active = selectedMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => changeMode(opt.value)}
                  disabled={!iAmHost}
                  aria-pressed={active}
                  className={`flex flex-1 flex-col items-start gap-1 rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200 dark:bg-indigo-950/50 dark:ring-indigo-900'
                      : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
                  } ${
                    iAmHost
                      ? 'cursor-pointer hover:border-indigo-300'
                      : 'cursor-default opacity-100'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {iAmHost && (
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                          active
                            ? 'border-indigo-600 bg-indigo-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    )}
                    <span className="font-semibold">{opt.label}</span>
                    {active && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                        선택됨
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{opt.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* 채팅 (휘발성 · Broadcast) — 하단 검은 반투명 컴팩트 패널 */}
        <section className="flex h-72 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/60 text-gray-100 shadow-xl backdrop-blur-md">
        <h2 className="border-b border-white/10 px-4 py-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          채팅
        </h2>
        <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {chats.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">아직 메시지가 없습니다.</p>
          ) : (
            chats.map((c) => {
              const mine = c.userId === myUserId;
              return (
                <div key={c.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!mine && <span className="mb-0.5 px-1 text-xs text-gray-400">{c.nickname}</span>}
                  <span
                    className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-3 py-1.5 text-sm ${
                      mine ? 'bg-indigo-600 text-white' : 'bg-white/15 text-gray-100'
                    }`}
                  >
                    {c.content}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={send} className="flex gap-2 border-t border-white/10 p-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="메시지를 입력하세요"
            maxLength={500}
            className="flex-1 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white placeholder-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/40"
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
      </div>
        </>
      )}
    </main>
  );
}
