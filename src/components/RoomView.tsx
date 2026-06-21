'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { RoomState, RoomMode } from '@/types/db';
import type { GameData } from '@/types/game';
import { MIN_SECONDS_PER_TOPIC, MAX_SECONDS_PER_TOPIC } from '@/lib/game';
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

// 채팅 입력창 최대 높이(px). 약 3줄까지 늘어난 뒤 스크롤(구글 미트 채팅 방식).
const CHAT_MAX_H = 80;

// 답변 제한시간 프리셋(초). null = 없음(무제한). 그 외 임의 값은 '기타'.
const TIME_PRESETS: { value: number | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: 120, label: '2분' },
  { value: 300, label: '5분' },
];

// 선택된 초 값을 사람이 읽는 라벨로(없음 / N분 / N분 M초).
function timeLabel(seconds: number | null): string {
  if (seconds === null) return '없음(무제한)';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

export default function RoomView({
  roomId,
  state,
  mode,
  currentTargetIdx,
  revealPage,
  phaseEndsAt,
  secondsPerTopic,
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
  secondsPerTopic: number | null;
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
  // 게임 시작 진행 중(방장이 시작을 누른 순간 ~ 작성 화면 전환 전) 잠금.
  // broadcast(self:true)로 전 참가자에 전파해, 이 구간엔 채팅을 제외한 모든 조작을 막는다.
  const [locked, setLocked] = useState(false);
  // 준비 상태: Presence 로 동기화 (DB 미사용). userId -> ready
  const [readyMap, setReadyMap] = useState<Record<string, boolean>>({});
  // 작성 완료(broadcast 즉시 동기화). 서버 progress 왕복을 기다리지 않고 완료한 사람을 바로 반영.
  const [remoteDone, setRemoteDone] = useState<Set<string>>(new Set());
  // 공개 모드: DB(rooms.mode) 영속 + broadcast 즉시 동기화
  const [selectedMode, setSelectedMode] = useState<RoomMode>(mode);
  // 답변 제한시간(초, null=없음): DB(rooms.seconds_per_topic) 영속 + broadcast 즉시 동기화
  const [selectedSeconds, setSelectedSeconds] = useState<number | null>(secondsPerTopic);
  // '기타' 분 입력창 열림 여부 + 입력 텍스트(방장 로컬 UI 상태)
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState('');
  // 공개 단계 페이지 위치를 낙관적으로 즉시 반영(서버 왕복 지연 체감 제거).
  // base = 오버라이드 당시의 서버 위치. 서버가 그 위치에서 움직이면(=base 와 달라지면) 오버라이드 폐기.
  const [revealOverride, setRevealOverride] = useState<{ ti: number; pg: number } | null>(null);
  // 단계 전환(finished/lobby 등)을 방장 조작 즉시 표시하는 낙관적 오버라이드(broadcast 공유).
  // 서버 state 가 확정되면 아래 prevState 블록에서 해제한다.
  const [phaseOverride, setPhaseOverride] = useState<RoomState | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  // 준비 상태를 broadcast 로 동기화. 새 참가자 입장 시 재전송하기 위해 ref 로 최신값 보관
  const myReadyRef = useRef(false);
  // 공개 이동: 연타 시 최종 위치 하나만 디바운스로 전송
  const revealSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealPendingRef = useRef<{ targetIdx: number; page: number } | 'finish' | null>(null);
  useEffect(
    () => () => {
      if (revealSendRef.current) clearTimeout(revealSendRef.current);
    },
    [],
  );

  const me = members.find((m) => m.userId === myUserId);
  const iAmHost = me?.isHost ?? false;
  const myReady = readyMap[myUserId] ?? false;
  // 방장 조작(종료/다시 시작)을 서버 왕복 전에 즉시 표시하는 낙관적 단계. 서버 state 가 따라오면 해제.
  const effectiveState = phaseOverride ?? state;
  const gameInProgress = effectiveState === 'writing' || effectiveState === 'revealing';

  // 하트비트 인터벌(고정 deps) 안에서 최신 방장/상태 값을 읽기 위한 ref — 커밋 후 갱신
  const pruneRef = useRef({ iAmHost, state });
  useEffect(() => {
    pruneRef.current = { iAmHost, state };
  });

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

  // 서버 갱신으로 prop(mode)이 바뀌면 로컬 상태도 맞춤 — 렌더 중 동기화(effect 불필요)
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setSelectedMode(mode);
  }

  // 서버 갱신으로 prop(secondsPerTopic)이 바뀌면 로컬 상태도 맞춤
  const [prevSeconds, setPrevSeconds] = useState(secondsPerTopic);
  if (secondsPerTopic !== prevSeconds) {
    setPrevSeconds(secondsPerTopic);
    setSelectedSeconds(secondsPerTopic);
  }

  // 새 작성 단계로 들어오면 직전 게임의 완료 broadcast 기록을 초기화 — 렌더 중 동기화
  const [prevState, setPrevState] = useState(state);
  if (state !== prevState) {
    setPrevState(state);
    if (state === 'writing') setRemoteDone(new Set());
    setStarting(false); // 단계가 실제로 전환되면 시작 버튼 잠금 해제(다음 게임 대비)
    setLocked(false); // 전환 완료 → 시작 진행 잠금 해제
  }

  // 서버 state 가 낙관적 단계에 도달하면 오버라이드 해제 — 렌더 중 동기화(effect 불필요)
  if (phaseOverride && state === phaseOverride) setPhaseOverride(null);

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
      // 답변 제한시간 변경 (방장 → 전체) 즉시 동기화
      .on('broadcast', { event: 'timelimit' }, ({ payload }) => {
        setSelectedSeconds((payload as { secondsPerTopic: number | null }).secondsPerTopic);
      })
      // 공개 단계 위치 이동 (방장 → 전체) 즉시 동기화. DB 반영(router.refresh)을 기다리지 않게 낙관적 표시.
      .on('broadcast', { event: 'reveal' }, ({ payload }) => {
        const { ti, pg } = payload as { ti: number; pg: number };
        setRevealOverride({ ti, pg });
      })
      // 단계 전환 (방장 → 전체) 즉시 동기화. 종료(finished)·다시 시작(lobby) 등을 서버 왕복 전에 표시.
      .on('broadcast', { event: 'phase' }, ({ payload }) => {
        setPhaseOverride((payload as { state: RoomState }).state);
      })
      // 시작 진행 중 잠금 (방장 → 전체). 채팅 외 모든 조작 비활성.
      .on('broadcast', { event: 'lock' }, ({ payload }) => {
        setLocked((payload as { locked: boolean }).locked);
      })
      // 작성 완료 (완료자 → 전체) 즉시 동기화. 서버 progress 재계산 왕복을 기다리지 않게 한다.
      .on('broadcast', { event: 'write-done' }, ({ payload }) => {
        const { userId } = payload as { userId: string };
        setRemoteDone((prev) => (prev.has(userId) ? prev : new Set(prev).add(userId)));
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

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || !channelRef.current) return;
    setText('');
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.overflowY = 'hidden';
    }
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
    if (locked) return;
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
    if (!iAmHost || locked || next === selectedMode) return;
    setSelectedMode(next); // 낙관적
    channelRef.current?.send({ type: 'broadcast', event: 'mode', payload: { mode: next } });
    // DB 영속(late-join 대비) — 실패해도 broadcast 로 즉시 반영은 됨
    fetch('/api/rooms/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, mode: next }),
    });
  }

  // 답변 제한시간 변경(초, null=없음). 모드와 동일하게 낙관적 + broadcast + DB 영속.
  function changeTimeLimit(next: number | null) {
    if (!iAmHost || locked || next === selectedSeconds) return;
    setSelectedSeconds(next); // 낙관적
    channelRef.current?.send({
      type: 'broadcast',
      event: 'timelimit',
      payload: { secondsPerTopic: next },
    });
    fetch('/api/rooms/timelimit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, secondsPerTopic: next }),
    });
  }

  // 시작 잠금 해제(본인 + 전체 broadcast). 실패/취소 시 호출.
  function unlock() {
    setStarting(false);
    setLocked(false);
    channelRef.current?.send({ type: 'broadcast', event: 'lock', payload: { locked: false } });
  }

  async function start() {
    if (!iAmHost || !allReady || starting) return;
    setStarting(true);
    // 채팅 외 모든 조작을 즉시 잠그고(본인) 전 참가자에게도 전파.
    setLocked(true);
    channelRef.current?.send({ type: 'broadcast', event: 'lock', payload: { locked: true } });
    try {
      const res = await fetch('/api/game/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        window.alert(d.error ?? '시작에 실패했습니다.');
        unlock(); // 실패 시에만 즉시 복구(전원)
      }
      // 성공 시 잠금 유지: rooms UPDATE → router.refresh 로 작성 화면이 실제로
      // 뜰 때까지 잠가 둔다(아래 단계 전환 시점에 해제). 응답 직후 잠깐 풀리는 빈틈 방지.
    } catch {
      window.alert('시작에 실패했습니다.');
      unlock();
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

  // 내가 내 몫을 모두 제출하면 전원에게 즉시 알림(broadcast). self:true 라 나도 받아 remoteDone 에 반영.
  const announceWriteDone = useCallback(() => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'write-done',
      payload: { userId: myUserId },
    });
  }, [myUserId]);

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

  // 오버라이드는 "낙관적 목표 위치". 서버가 그 위치에 도달할 때까지 유지한다.
  // (디바운스 경계를 넘는 연타로 서버가 잠깐 중간 위치로 이동해도 표시가 튀지 않게)
  // 서버가 낙관적 목표 위치에 도달하면 오버라이드 해제 — 렌더 중 정리(effect 불필요)
  if (
    revealOverride &&
    currentTargetIdx === revealOverride.ti &&
    revealPage === revealOverride.pg
  ) {
    setRevealOverride(null);
  }
  const revealTi = revealOverride ? revealOverride.ti : currentTargetIdx;
  const revealPg = revealOverride ? revealOverride.pg : revealPage;

  // 디바운스된 최종 위치를 서버에 전송(절대 위치 또는 종료)
  function flushRevealSend() {
    const pending = revealPendingRef.current;
    revealPendingRef.current = null;
    if (!pending) return;
    fetch('/api/game/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pending === 'finish' ? { roomId, finish: true } : { roomId, ...pending }),
    }).catch(() => {
      // 실패 시 낙관적 표시를 되돌린다(위치·단계 모두).
      setRevealOverride(null);
      setPhaseOverride(null);
    });
  }

  function revealNav(dir: 'next' | 'prev') {
    if (!game) return;
    // 낙관적: 이미 로드된 메시지로 다음/이전 위치를 즉시 계산해 카드를 바로 넘긴다.
    const pagesOf = (ti: number) => {
      const t = game.targets[ti];
      return 1 + (t ? game.messagesByAssignment[t.assignmentId]?.length ?? 0 : 0);
    };
    let ti = revealTi;
    let pg = revealPg;
    let action: { targetIdx: number; page: number } | 'finish' | null = null;
    if (dir === 'next') {
      if (pg < pagesOf(ti) - 1) {
        pg += 1;
        action = { targetIdx: ti, page: pg };
      } else if (ti < game.targets.length - 1) {
        ti += 1;
        pg = 0;
        action = { targetIdx: ti, page: pg };
      } else {
        action = 'finish';
      }
    } else {
      if (pg > 0) {
        pg -= 1;
        action = { targetIdx: ti, page: pg };
      } else if (ti > 0) {
        ti -= 1;
        pg = pagesOf(ti) - 1;
        action = { targetIdx: ti, page: pg };
      }
    }
    if (!action) return;
    // 종료는 카드를 더 넘기지 않고 최종 결과창으로 전환을 전원에게 즉시 broadcast,
    // 그 외엔 낙관적으로 즉시 이동 표시 + 전원에게 위치 broadcast.
    if (action === 'finish') {
      setPhaseOverride('finished');
      channelRef.current?.send({ type: 'broadcast', event: 'phase', payload: { state: 'finished' } });
    } else {
      setRevealOverride({ ti, pg });
      channelRef.current?.send({ type: 'broadcast', event: 'reveal', payload: { ti, pg } });
    }
    revealPendingRef.current = action;
    // 연타를 모아 최종 위치 하나만 전송(마지막 쓰기 승리 → 표시가 되돌아가지 않음)
    if (revealSendRef.current) clearTimeout(revealSendRef.current);
    revealSendRef.current = setTimeout(flushRevealSend, 130);
  }

  // 특정 대상의 처음 페이지(소개)로 바로 이동 — 절대 위치 전송(연타 디바운스 공유)
  function revealJump(targetIdx: number) {
    if (!game) return;
    const ti = Math.max(0, Math.min(game.targets.length - 1, targetIdx));
    const pg = 0;
    setRevealOverride({ ti, pg });
    channelRef.current?.send({ type: 'broadcast', event: 'reveal', payload: { ti, pg } });
    revealPendingRef.current = { targetIdx: ti, page: pg };
    if (revealSendRef.current) clearTimeout(revealSendRef.current);
    revealSendRef.current = setTimeout(flushRevealSend, 130);
  }

  function resetGame() {
    // 대기실로 전환을 전원에게 즉시 broadcast(낙관적). 직전 게임의 공개 위치 오버라이드도 정리.
    setRevealOverride(null);
    setPhaseOverride('lobby');
    channelRef.current?.send({ type: 'broadcast', event: 'phase', payload: { state: 'lobby' } });
    fetch('/api/game/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId }),
    }).catch(() => setPhaseOverride(null));
  }

  async function kick(targetUserId: string) {
    if (locked) return;
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

  // 모든 단계(대기/작성/공개/종료)에서 공통으로 보여줄 채팅 패널
  const chatPanel = (
    <section className="rounded-3xl glass-panel-dark p-6 flex h-full min-h-[320px] w-full flex-col justify-between text-white overflow-hidden shadow-2xl">
      <div className="border-b border-white/10 pb-3 mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          실시간 대화방
        </h2>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto pr-1">
        {chats.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-xs text-gray-400">자유롭게 채팅을 나누어 보세요.</p>
          </div>
        ) : (
          chats.map((c, i) => {
            const mine = c.userId === myUserId;
            // 같은 사용자가 연속으로 보낸 메시지면 작성자 이름을 한 번만 보여주고 간격을 좁힌다.
            const firstOfGroup = i === 0 || chats[i - 1].userId !== c.userId;
            return (
              <div
                key={c.id}
                className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${
                  i === 0 ? '' : firstOfGroup ? 'mt-3' : 'mt-1'
                }`}
              >
                {!mine && firstOfGroup && (
                  <span className="mb-1 px-1 text-[10px] font-bold text-gray-400">
                    {c.nickname}
                  </span>
                )}
                <span
                  className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                    mine
                      ? 'bg-blue-600 text-white font-medium rounded-tr-none'
                      : 'bg-white/10 text-white rounded-tl-none border border-white/5'
                  }`}
                >
                  {c.content}
                </span>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={send} className="flex items-end gap-2 border-t border-white/10 pt-4 mt-3">
        <textarea
          ref={chatInputRef}
          aria-label="채팅 메시지 입력"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            // 구글 미트 채팅처럼: 내용에 맞춰 약 3줄까지 위로 늘어나고, 그 뒤부터 스크롤.
            // 상한 미만이면 overflow 를 hidden 으로 둬 한 줄에서 스크롤바가 뜨지 않게 한다.
            const ta = e.target;
            ta.style.height = 'auto';
            ta.style.height = `${Math.min(ta.scrollHeight, CHAT_MAX_H)}px`;
            ta.style.overflowY = ta.scrollHeight > CHAT_MAX_H ? 'auto' : 'hidden';
          }}
          onKeyDown={(e) => {
            // Enter = 전송, Shift+Enter = 줄바꿈
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          placeholder="메시지를 입력하세요"
          maxLength={500}
          className="max-h-20 min-h-[40px] flex-1 resize-none overflow-y-hidden rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs leading-relaxed text-white placeholder-gray-400 outline-none transition focus:border-rose-400 focus:bg-white/10 focus:ring-2 focus:ring-rose-400/20 [scrollbar-color:rgba(255,255,255,0.25)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/25 [&::-webkit-scrollbar-track]:bg-transparent"
        />
        <button
          type="submit"
          aria-label="메시지 전송"
          disabled={!text.trim()}
          className="h-10 shrink-0 rounded-2xl bg-blue-600 px-4 text-xs font-bold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          전송
        </button>
      </form>
    </section>
  );

  // 단계별 본문 영역 클래스. 채팅은 통일 셸의 고정 위치에 한 번만 렌더(아래)해 remount(입력/포커스/높이 손실)를 막는다.
  const gameView =
    (effectiveState === 'writing' ||
      effectiveState === 'revealing' ||
      effectiveState === 'finished') &&
    !!game;
  const mainClass =
    'flex min-h-0 min-w-0 flex-1 flex-col' +
    (effectiveState === 'finished' ? ' gap-6' : '') +
    (gameView ? '' : ' overflow-y-auto');

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-6 py-6 sm:px-8 lg:h-dvh lg:overflow-hidden lg:px-10">
      {/* 백그라운드 오로라 데코 — inset-0 + overflow-hidden 래퍼로 가둬 가로 스크롤 폭을 넓히지 않게 한다
          (narrow 화면에서 데코가 main 밖으로 삐져나가 좌측이 잘리던 문제 방지) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-20 -left-20 h-96 w-96 rounded-full bg-rose-100/40 blur-3xl" />
        <div className="absolute top-40 -right-20 h-96 w-96 rounded-full bg-violet-100/40 blur-3xl" />
      </div>

      <header className="relative z-10 mb-8 flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {roomId}번 방
          </h1>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-gray-600 border border-white/60 shadow-sm backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
            {STATE_LABEL[effectiveState]} · {selectedMode === 'anonymous' ? '익명 모드' : '실명 모드'}
          </span>
        </div>
        <button
          onClick={leave}
          aria-label="방 나가기"
          disabled={leaving || gameInProgress || locked}
          title={
            gameInProgress
              ? '게임 진행 중에는 나갈 수 없습니다.'
              : locked
                ? '게임을 시작하는 중입니다.'
                : undefined
          }
          className="rounded-2xl border border-rose-200/50 bg-rose-50/40 px-4 py-2 text-sm font-semibold text-rose-600 backdrop-blur-sm transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          방 나가기
        </button>
      </header>

      {/* 본문 + 채팅 통일 셸: 채팅(2번째 칸)은 단계와 무관하게 항상 같은 트리 위치에서 한 번만
          렌더된다 → 단계 전환 시 textarea 가 remount 되지 않아 입력 내용·포커스·높이가 유지된다. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-stretch">
        <div className={mainClass}>
          {effectiveState === 'writing' && game ? (
            <WritingView
              targets={game.targets}
              myMessages={game.myMessages}
              myUserId={myUserId}
              phaseEndsAt={phaseEndsAt}
              secondsPerTopic={secondsPerTopic}
              progress={game.progress}
              doneUserIds={remoteDone}
              onWrite={writeMessage}
              onAllSubmitted={announceWriteDone}
              onTimeUp={requestToReveal}
            />
          ) : effectiveState === 'revealing' && game ? (
            <RevealView
              targets={game.targets}
              messagesByAssignment={game.messagesByAssignment}
              currentTargetIdx={revealTi}
              revealPage={revealPg}
              iAmHost={iAmHost}
              onNav={revealNav}
              onJump={revealJump}
            />
          ) : effectiveState === 'finished' && game ? (
            <>
              {/* 게임 종료 헤더 — 제목과 버튼을 한 줄에 */}
              <div className="shrink-0 border-b border-gray-200/50 pb-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-gray-900">게임 종료</h2>
              {iAmHost && (
                <button
                  onClick={resetGame}
                  aria-label="다시 시작하기"
                  className="shrink-0 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 active:bg-blue-800"
                >
                  다시 시작하기
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500 font-semibold">
              소중한 동료들이 정성껏 남긴 전체 롤링페이퍼 결과를 확인해 보세요. (카드를 누르면 크게 볼 수 있어요)
            </p>
              </div>

              {/* 헤더 아래: 결과 카드 영역 */}
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <FinishedView
                  targets={game.targets}
                  messagesByAssignment={game.messagesByAssignment}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-8 lg:grid-cols-12">
          {/* 좌측: 참가자 현황 및 준비/시작 컨트롤 */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            <section className="rounded-3xl glass-card p-6 flex-1 flex flex-col justify-between min-h-[400px]">
              <div>
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      참가자 목록
                    </h2>
                    <p className="text-xl font-extrabold text-gray-800 mt-1">
                      현재 대기 인원 ({members.length}/7)
                    </p>
                  </div>

                  {iAmHost ? (
                    <div className="flex flex-col items-end gap-1.5">
                      <button
                        onClick={start}
                        aria-label="게임 시작하기"
                        disabled={!allReady || starting}
                        className={`rounded-2xl px-6 py-3 text-sm font-bold shadow-md transition-all ${
                          allReady && !starting
                            ? 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                      >
                        {starting ? '시작 중…' : '게임 시작하기'}
                      </button>
                      {startDisabledReason && (
                        <p className="text-xs text-rose-500 font-semibold mt-1">
                          {startDisabledReason}
                        </p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={toggleReady}
                      aria-label="준비 상태 전환"
                      disabled={locked}
                      title={locked ? '게임을 시작하는 중입니다.' : undefined}
                      className={`rounded-2xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 ${
                        myReady
                          ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {myReady ? '준비 완료 (클릭해 취소)' : '준비하기'}
                    </button>
                  )}
                </div>

                <ul className="grid gap-4 sm:grid-cols-2">
                  {members.map((m) => {
                    const ready = readyMap[m.userId] ?? false;
                    const isMe = m.userId === myUserId;
                    return (
                      <li
                        key={m.userId}
                        className={`flex items-center justify-between rounded-2xl border p-4.5 transition-all ${
                          isMe
                            ? 'bg-rose-50/70 border-rose-200/60 shadow-sm'
                            : 'bg-white/60 border-white/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${
                            m.isHost 
                              ? 'bg-amber-100 text-amber-700' 
                              : isMe 
                                ? 'bg-rose-100 text-rose-700' 
                                : 'bg-gray-100 text-gray-600'
                          }`}>
                            {m.nickname.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-gray-800">
                              {m.nickname}
                            </span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isMe && (
                                <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                                  나
                                </span>
                              )}
                              {m.isHost ? (
                                <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-700">
                                  방장
                                </span>
                              ) : ready ? (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700">
                                  준비 완료
                                </span>
                              ) : (
                                <span className="rounded-full bg-gray-100 px-1.5 py-0.2 text-[10px] font-bold text-gray-500">
                                  대기 중
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {iAmHost && !m.isHost && (
                          <button
                            onClick={() => kick(m.userId)}
                            aria-label={`${m.nickname} 강퇴`}
                            disabled={locked}
                            title={locked ? '게임을 시작하는 중입니다.' : undefined}
                            className="rounded-xl border border-rose-200 bg-rose-50/50 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            강퇴
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-8 flex items-center justify-between border-t border-white/50 pt-5">
                <span className="text-xs font-semibold text-gray-400">
                  최소 3명 가입 시 게임 진행 가능
                </span>
                {iAmHost && (
                  <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                    당신이 이 방의 방장입니다.
                  </span>
                )}
              </div>
            </section>
          </div>

          {/* 우측: 공개 모드 설정 및 채팅창 */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            {/* 공개 모드 선택 */}
            <section className="rounded-3xl glass-card p-6 flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    공개 모드 설정
                  </h2>
                  <p className="text-sm font-bold text-gray-700 mt-0.5">
                    {iAmHost ? '게임 공개 방식을 선택하세요' : '방장이 설정한 게임 모드'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {MODE_OPTIONS.map((opt) => {
                  const active = selectedMode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => changeMode(opt.value)}
                      aria-label={`${opt.label} 선택`}
                      disabled={!iAmHost || locked}
                      className={`flex flex-col gap-2 rounded-2xl border p-4 text-left transition-all ${
                        active
                          ? 'border-rose-400 bg-rose-50/50 ring-2 ring-rose-200/50'
                          : 'border-white/50 bg-white/30'
                      } ${
                        iAmHost && !locked
                          ? 'cursor-pointer hover:border-rose-300 hover:bg-white/40'
                          : 'cursor-default opacity-90'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-gray-800">{opt.label}</span>
                        {active && (
                          <span className="h-2 w-2 rounded-full bg-rose-500" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500 leading-normal">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 답변 제한시간 설정 */}
            <section className="rounded-3xl glass-card p-6 flex flex-col">
              <div className="mb-4">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  답변 제한시간 설정
                </h2>
                <p className="text-sm font-bold text-gray-700 mt-0.5">
                  {iAmHost
                    ? '질문(답변) 1개당 제한시간을 선택하세요'
                    : `방장이 설정한 제한시간 · ${timeLabel(selectedSeconds)}`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {TIME_PRESETS.map((opt) => {
                  const active = !customOpen && selectedSeconds === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setCustomOpen(false);
                        changeTimeLimit(opt.value);
                      }}
                      aria-label={`제한시간 ${opt.label} 선택`}
                      disabled={!iAmHost || locked}
                      className={`rounded-2xl border px-3 py-3 text-sm font-extrabold transition-all ${
                        active
                          ? 'border-violet-400 bg-violet-50/60 text-violet-700 ring-2 ring-violet-200/50'
                          : 'border-white/50 bg-white/30 text-gray-700'
                      } ${
                        iAmHost && !locked
                          ? 'cursor-pointer hover:border-violet-300 hover:bg-white/40'
                          : 'cursor-default opacity-90'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
                {/* 기타 */}
                {(() => {
                  const isCustom =
                    selectedSeconds !== null &&
                    !TIME_PRESETS.some((p) => p.value === selectedSeconds);
                  const active = customOpen || isCustom;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomText(isCustom ? String(Math.round(selectedSeconds! / 60)) : '');
                        setCustomOpen(true);
                      }}
                      aria-label="제한시간 기타(직접 입력) 선택"
                      disabled={!iAmHost || locked}
                      className={`rounded-2xl border px-3 py-3 text-sm font-extrabold transition-all ${
                        active
                          ? 'border-violet-400 bg-violet-50/60 text-violet-700 ring-2 ring-violet-200/50'
                          : 'border-white/50 bg-white/30 text-gray-700'
                      } ${
                        iAmHost && !locked
                          ? 'cursor-pointer hover:border-violet-300 hover:bg-white/40'
                          : 'cursor-default opacity-90'
                      }`}
                    >
                      기타
                    </button>
                  );
                })()}
              </div>

              {customOpen && iAmHost && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={60}
                    value={customText}
                    aria-label="제한시간 직접 입력(분)"
                    autoFocus
                    disabled={locked}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '');
                      setCustomText(v);
                      const sec = parseInt(v, 10) * 60;
                      if (
                        Number.isInteger(sec) &&
                        sec >= MIN_SECONDS_PER_TOPIC &&
                        sec <= MAX_SECONDS_PER_TOPIC
                      ) {
                        changeTimeLimit(sec);
                      }
                    }}
                    placeholder="분 (1~60)"
                    className="w-28 rounded-xl border border-gray-200 bg-white/70 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-200/50"
                  />
                  <span className="text-sm font-semibold text-gray-500">분</span>
                </div>
              )}
            </section>

          </div>
        </div>
          )}
        </div>
        <div className="flex lg:w-80 lg:shrink-0">{chatPanel}</div>
      </div>
    </main>
  );
}

