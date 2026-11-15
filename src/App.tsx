import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Compass,
  Crown,
  Dices,
  LogOut,
  Play,
  Plus,
  RotateCw,
  Shield,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
  Zap,
} from 'lucide-react';
import { AndroidApkModal } from './components/AndroidApkModal';
import { NameEntryModal } from './components/NameEntryModal';
import { PathblockBoard } from './components/PathblockBoard';
import { RulesModal } from './components/RulesModal';
import { SocialSidebar } from './components/SocialSidebar';
import { findShortestPath } from './shared/pathblockEngine';
import type { DifficultyMode, GameAction, Orientation } from './shared/pathblockEngine';
import type {
  ChatMessage,
  ClientToServerMessage,
  FriendEntry,
  FriendRequestEntry,
  OnlinePlayerInfo,
  RoomInvite,
  RoomState,
  RoomSummary,
  ServerToClientMessage,
} from './shared/protocol';
import { soundFx } from './utils/soundFx';

const STORAGE_ID_KEY = 'pathblock_player_id';
const STORAGE_NAME_KEY = 'pathblock_player_name';

function getOrCreatePlayerId(): string {
  const existing = localStorage.getItem(STORAGE_ID_KEY);
  if (existing && existing.trim()) return existing;
  const created = `pb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  localStorage.setItem(STORAGE_ID_KEY, created);
  return created;
}

interface ToastItem {
  id: string;
  level: 'info' | 'success' | 'error';
  message: string;
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState<string>(
    () => localStorage.getItem(STORAGE_NAME_KEY) || ''
  );
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showAndroidModal, setShowAndroidModal] = useState(false);

  const [wsConnected, setWsConnected] = useState(false);
  const [isOnlineBrowser, setIsOnlineBrowser] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  const [wins, setWins] = useState(0);
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayerInfo[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [globalChat, setGlobalChat] = useState<ChatMessage[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestEntry[]>([]);
  const [currentRoom, setCurrentRoom] = useState<RoomState | null>(null);
  const [pendingInvite, setPendingInvite] = useState<RoomInvite | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Room Creation Form
  const [roomTitle, setRoomTitle] = useState('');
  const [createMode, setCreateMode] = useState<DifficultyMode>('standard');
  const [createMaxPlayers, setCreateMaxPlayers] = useState<number>(2);
  const [customSeedInput, setCustomSeedInput] = useState<string>('');
  const [autoFillBots, setAutoFillBots] = useState<boolean>(false);

  // Gameplay controls
  const [actionMode, setActionMode] = useState<'move' | 'wall'>('move');
  const [wallOrientation, setWallOrientation] = useState<Orientation>('H');
  const [muted, setMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBoardTurnRef = useRef<number>(0);

  const pushToast = useCallback((level: ToastItem['level'], message: string) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, level, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Browser online/offline status
  useEffect(() => {
    const onOnline = () => setIsOnlineBrowser(true);
    const onOffline = () => setIsOnlineBrowser(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  // WebSocket lifecycle
  useEffect(() => {
    if (!playerName) return;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'auth:identify',
            playerId,
            name: playerName,
          } satisfies ClientToServerMessage)
        );
      };

      ws.onmessage = (event) => {
        let data: ServerToClientMessage;
        try {
          data = JSON.parse(event.data) as ServerToClientMessage;
        } catch {
          return;
        }

        if (data.type === 'init') {
          setWins(data.wins);
          setOnlinePlayers(data.onlinePlayers);
          setRooms(data.rooms);
          setGlobalChat(data.globalChat);
          setFriends(data.friends);
          setFriendRequests(data.friendRequests);
          setCurrentRoom(data.currentRoom);
        } else if (data.type === 'presence:update') {
          setOnlinePlayers(data.onlinePlayers);
          setRooms(data.rooms);
        } else if (data.type === 'friends:update') {
          setFriends(data.friends);
          setFriendRequests(data.friendRequests);
        } else if (data.type === 'room:update') {
          setCurrentRoom(data.room);
          if (data.room?.board) {
            const turn = data.room.board.turnNumber;
            if (turn > prevBoardTurnRef.current) {
              if (data.room.board.winnerSlot !== null) {
                soundFx.playVictory();
              } else if (data.room.board.lastActionText.includes('+1 engel')) {
                soundFx.playBonus();
              } else if (data.room.board.lastActionText.includes('engel koydu')) {
                soundFx.playWall();
              } else {
                soundFx.playMove();
              }
            }
            prevBoardTurnRef.current = turn;
          } else {
            prevBoardTurnRef.current = 0;
          }
        } else if (data.type === 'chat:message') {
          if (data.message.scope === 'global') {
            setGlobalChat((prev) =>
              prev.some((m) => m.id === data.message.id) ? prev : [...prev.slice(-59), data.message]
            );
          } else {
            setCurrentRoom((prev) => {
              if (!prev) return prev;
              if (prev.chat.some((m) => m.id === data.message.id)) return prev;
              return { ...prev, chat: [...prev.chat.slice(-79), data.message] };
            });
          }
        } else if (data.type === 'invite:received') {
          setPendingInvite(data.invite);
        } else if (data.type === 'toast') {
          if (data.level === 'error') soundFx.playError();
          pushToast(data.level, data.message);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        wsRef.current = null;
        if (!unmounted) {
          reconnectTimerRef.current = setTimeout(connect, 2000);
        }
      };
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [playerId, playerName, pushToast]);

  // Keyboard shortcuts during gameplay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === 'r' || e.key === 'R') {
        setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'));
      } else if (e.key === 'w' || e.key === 'W') {
        setActionMode('wall');
      } else if (e.key === 'm' || e.key === 'M') {
        setActionMode('move');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleNameSubmit = (newName: string) => {
    localStorage.setItem(STORAGE_NAME_KEY, newName);
    setPlayerName(newName);
    setShowRenameModal(false);
    if (wsConnected) {
      sendWs({ type: 'auth:rename', name: newName });
    }
  };

  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedSeed = customSeedInput.trim() ? Number(customSeedInput.trim()) : undefined;
    sendWs({
      type: 'room:create',
      title: roomTitle.trim() || `${playerName} Odası`,
      mode: createMode,
      maxPlayers: createMaxPlayers,
      seed: parsedSeed && Number.isFinite(parsedSeed) ? Math.abs(Math.floor(parsedSeed)) : undefined,
      autoFillBots,
    });
    setRoomTitle('');
    setCustomSeedInput('');
  };

  const handleGameAction = (action: GameAction) => {
    sendWs({ type: 'game:action', action });
    if (action.type === 'wall') {
      setActionMode('move');
    }
  };

  const toggleMute = () => {
    soundFx.muted = !muted;
    setMuted(!muted);
  };

  const modeLabel = (m: DifficultyMode) => {
    if (m === 'blitz') return 'Hızlı (7×7)';
    if (m === 'labyrinth') return 'Labirent (11×11)';
    return 'Standart (9×9)';
  };

  const board = currentRoom?.board ?? null;
  const activeBoardPlayer = board ? board.players[board.currentTurnIndex] : null;
  const myBoardPlayer = board ? board.players.find((p) => p.id === playerId) ?? null : null;
  const isMyTurn = Boolean(
    board && myBoardPlayer && activeBoardPlayer?.id === myBoardPlayer.id && board.winnerSlot === null
  );
  const isHost = Boolean(currentRoom && currentRoom.hostId === playerId);

  const playerDistances = useMemo(() => {
    if (!board) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const p of board.players) {
      const res = findShortestPath(
        board.size,
        board.stones,
        board.walls,
        p.r,
        p.c,
        p.goalType,
        p.goalValue
      );
      map.set(p.slot, res.distance);
    }
    return map;
  }, [board]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1120] text-slate-100">
      {/* First-entry Name Prompt or Rename Modal */}
      {(!playerName || showRenameModal) && (
        <NameEntryModal
          initialName={playerName}
          isRename={Boolean(playerName && showRenameModal)}
          onSubmit={handleNameSubmit}
          onCancel={() => setShowRenameModal(false)}
        />
      )}

      {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}
      {showAndroidModal && <AndroidApkModal onClose={() => setShowAndroidModal(false)} />}

      {/* 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#0B1120]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-8 px-4 sm:px-6 h-16">
          {/* Zone 1: Single-line Wordmark */}
          <button
            type="button"
            onClick={() => currentRoom && sendWs({ type: 'room:leave' })}
            className="font-display text-xl font-extrabold tracking-tight text-slate-50 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Pathblock Arena
          </button>

          {/* Zone 2: Clean Single-Line Text Nav Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => currentRoom && sendWs({ type: 'room:leave' })}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Lobi
            </button>
            <button
              type="button"
              onClick={() => setShowRulesModal(true)}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Kurallar
            </button>
            <button
              type="button"
              onClick={() => setShowAndroidModal(true)}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Android APK
            </button>
            <button
              type="button"
              onClick={() => setShowRenameModal(true)}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {playerName ? `${playerName} · Ad Değiştir` : 'Ad Değiştir'}
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAndroidModal(true)}
              className="md:hidden rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              APK
            </button>
            {currentRoom ? (
              <button
                type="button"
                onClick={() => sendWs({ type: 'room:leave' })}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Odadan Çık</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  sendWs({
                    type: 'room:quickmatch',
                    mode: createMode,
                    maxPlayers: createMaxPlayers,
                  })
                }
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Hızlı Eşleş</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Secondary Quick Bar */}
      <div className="flex md:hidden items-center justify-between gap-3 border-b border-slate-800/70 bg-slate-900/70 px-4 py-2 text-xs text-slate-300">
        <button
          type="button"
          onClick={() => setShowRenameModal(true)}
          className="truncate font-medium hover:text-amber-300"
        >
          Oyuncu: {playerName}
        </button>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setShowRulesModal(true)} className="text-slate-400">
            Kurallar
          </button>
          <span aria-hidden="true" className="text-slate-700">·</span>
          <span className="font-mono text-emerald-400 tabular-nums">{onlinePlayers.length} Çevrim İçi</span>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* LEFT / MAIN WORKSPACE (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* CASE A: LOBBY */}
            {!currentRoom && (
              <>
                {/* Hero / Quick Match & Create Room */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-800/80">
                    <div>
                      <div className="text-xs font-medium text-slate-400 mb-1.5">
                        {onlinePlayers.length} Çevrim İçi · {rooms.length} Aktif Oda · {wins} Galibiyetin
                      </div>
                      <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-50">
                        Yolu Aç, Rakiplerini Blokla.
                      </h1>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        sendWs({
                          type: 'room:quickmatch',
                          mode: createMode,
                          maxPlayers: createMaxPlayers,
                        })
                      }
                      className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Zap className="w-4 h-4" />
                      <span>Hızlı Oyun (Rakip Yoksa Botla Başla)</span>
                    </button>
                  </div>

                  {/* Create Custom Room Form */}
                  <form onSubmit={handleCreateRoom} className="pt-6 space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          htmlFor="room-title"
                          className="block text-xs font-medium text-slate-400 mb-1.5"
                        >
                          Oda Adı
                        </label>
                        <input
                          id="room-title"
                          type="text"
                          maxLength={28}
                          value={roomTitle}
                          onChange={(e) => setRoomTitle(e.target.value)}
                          placeholder={`${playerName || 'Oyuncu'} Arenası`}
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="seed-input"
                          className="block text-xs font-medium text-slate-400 mb-1.5"
                        >
                          Seviye Tohumu (İsteğe Bağlı)
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="seed-input"
                            type="number"
                            value={customSeedInput}
                            onChange={(e) => setCustomSeedInput(e.target.value)}
                            placeholder="Otomatik rastgele üretilir"
                            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCustomSeedInput(
                                String(Math.floor(Math.random() * 899999 + 100000))
                              )
                            }
                            title="Rastgele Tohum Üret"
                            className="rounded-xl border border-slate-700 bg-slate-800 px-3 text-slate-300 hover:bg-slate-700 cursor-pointer shrink-0"
                          >
                            <Dices className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Player Count Selector */}
                      <div>
                        <span className="block text-xs font-medium text-slate-400 mb-1.5">
                          Oyuncu Sayısı
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
                          {[2, 3, 4].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => setCreateMaxPlayers(cnt)}
                              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                createMaxPlayers === cnt
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-slate-100'
                              }`}
                            >
                              {cnt} Kişi
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Procedural Board Size Mode */}
                      <div>
                        <span className="block text-xs font-medium text-slate-400 mb-1.5">
                          Harita Boyutu & Zorluk
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800">
                          {(
                            [
                              { id: 'blitz', label: 'Hızlı 7×7' },
                              { id: 'standard', label: 'Standart 9×9' },
                              { id: 'labyrinth', label: 'Labirent 11×11' },
                            ] as const
                          ).map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setCreateMode(m.id)}
                              className={`rounded-lg py-2 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap truncate px-1 ${
                                createMode === m.id
                                  ? 'bg-slate-800 text-slate-50 shadow-sm'
                                  : 'text-slate-400 hover:text-slate-100'
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
                      <label className="inline-flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoFillBots}
                          onChange={(e) => setAutoFillBots(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-600 bg-slate-950 text-amber-500 focus:ring-amber-500"
                        />
                        <span>Boş koltukları botlarla doldurup hemen başlat</span>
                      </label>

                      <button
                        type="submit"
                        className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>{autoFillBots ? 'Botlarla Oda Kur & Başla' : 'Çevrim İçi Oda Kur'}</span>
                      </button>
                    </div>
                  </form>
                </section>

                {/* Open Rooms List */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h2 className="font-display text-lg font-bold text-slate-100">
                      Açık Odalar ve Devam Eden Maçlar
                    </h2>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      {rooms.length} oda
                    </span>
                  </div>

                  {rooms.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 py-10 px-4 text-center">
                      <p className="text-sm text-slate-400 mb-3">
                        Şu an bekleyen açık oda bulunmuyor.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          sendWs({
                            type: 'room:quickmatch',
                            mode: createMode,
                            maxPlayers: createMaxPlayers,
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-xl bg-amber-500/15 border border-amber-500/30 px-4 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
                      >
                        <Bot className="w-4 h-4" />
                        <span>Botlarla Anında Oda Kur</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {rooms.map((r) => {
                        const isFull = r.members.length >= r.maxPlayers;
                        const isWaiting = r.status === 'waiting';
                        return (
                          <div
                            key={r.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                          >
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-100 truncate">
                                {r.title}
                              </h3>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1">
                                <span>{modeLabel(r.mode)}</span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {r.members.length}/{r.maxPlayers} Oyuncu
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className={isWaiting ? 'text-emerald-400' : 'text-amber-400'}>
                                  {isWaiting ? 'Bekliyor' : 'Oyunda'}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={!isWaiting || isFull}
                              onClick={() => sendWs({ type: 'room:join', roomId: r.id })}
                              className={`rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                                isWaiting && !isFull
                                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 cursor-pointer'
                                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                              }`}
                            >
                              {isFull ? 'Dolu' : isWaiting ? 'Katıl' : 'Sürüyor'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* CASE B: ROOM WAITING LOBBY */}
            {currentRoom && currentRoom.status === 'waiting' && (
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
                  <div>
                    <div className="text-xs font-medium text-slate-400 mb-1">
                      Oda Kodu: <span className="font-mono text-slate-200">{currentRoom.id}</span> ·{' '}
                      {modeLabel(currentRoom.mode)} · {currentRoom.maxPlayers} Kişilik
                    </div>
                    <h1 className="font-display text-2xl font-bold text-slate-50">
                      {currentRoom.title}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {isHost && currentRoom.members.length < currentRoom.maxPlayers && (
                      <button
                        type="button"
                        onClick={() => sendWs({ type: 'room:add_bot' })}
                        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-100 hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                      >
                        <Bot className="w-4 h-4 text-sky-400" />
                        <span>Bot Ekle</span>
                      </button>
                    )}

                    {isHost && (
                      <button
                        type="button"
                        onClick={() => sendWs({ type: 'room:start' })}
                        className="flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        <span>
                          {currentRoom.members.length < 2
                            ? 'Bot ile Başlat'
                            : 'Maçı Başlat'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Seat Grid (up to 4) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {Array.from({ length: currentRoom.maxPlayers }, (_, idx) => {
                    const member = currentRoom.members[idx];
                    const slotColors = ['#10B981', '#F43F5E', '#38BDF8', '#F59E0B'];
                    const color = slotColors[idx % slotColors.length];

                    if (!member) {
                      return (
                        <div
                          key={`seat-empty-${idx}`}
                          className="flex items-center justify-between rounded-xl border border-dashed border-slate-800 bg-slate-950/40 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className="h-8 w-8 rounded-full border-2 border-dashed opacity-50"
                              style={{ borderColor: color }}
                            />
                            <div>
                              <div className="text-sm font-medium text-slate-400">
                                Boş Koltuk #{idx + 1}
                              </div>
                              <div className="text-xs text-slate-500">
                                Çevrim içi oyuncu veya bot bekleniyor
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={member.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-bold text-slate-950 shrink-0"
                            style={{ backgroundColor: color }}
                          >
                            {member.isBot ? <Bot className="w-4 h-4" /> : member.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-100 truncate">
                              <span className="truncate">{member.name}</span>
                              {member.id === currentRoom.hostId && (
                                <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {member.isBot ? 'Yapay Zeka Bot' : `${member.wins} galibiyet`}
                            </div>
                          </div>
                        </div>

                        {isHost && member.isBot && (
                          <button
                            type="button"
                            onClick={() => sendWs({ type: 'room:remove_bot', botId: member.id })}
                            aria-label="Botu Çıkar"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-400">
                  İpucu: Sağdaki <strong>Çevrim İçi</strong> veya <strong>Arkadaşlar</strong> sekmesinden arkadaşlarını bu odaya davet edebilir, ya da kimse yoksa doğrudan <strong>Bot ile Başlat</strong> diyebilirsin.
                </p>
              </section>
            )}

            {/* CASE C: ACTIVE GAMEPLAY OR FINISHED */}
            {currentRoom && board && (
              <section className="space-y-4">
                {/* Player Turn HUD Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {board.players.map((p) => {
                    const isTurn =
                      board.winnerSlot === null &&
                      board.players[board.currentTurnIndex]?.slot === p.slot;
                    const isWinner = board.winnerSlot === p.slot;
                    const dist = playerDistances.get(p.slot);

                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border px-3 py-2.5 transition-colors ${
                          isWinner
                            ? 'border-amber-400 bg-amber-500/15'
                            : isTurn
                            ? 'border-slate-500 bg-slate-800/95 shadow-md'
                            : 'border-slate-800 bg-slate-900/90 opacity-85'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            <span className="text-xs font-semibold text-slate-100 truncate">
                              {p.name}
                            </span>
                          </div>
                          {p.isBot && <Bot className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                        </div>

                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums">
                          <span>Engel: {p.wallsLeft}</span>
                          <span>
                            {isWinner
                              ? 'Kazandı'
                              : Number.isFinite(dist)
                              ? `Yol: ${dist}`
                              : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Tactical Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!isMyTurn}
                      onClick={() => setActionMode('move')}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        actionMode === 'move'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      } ${!isMyTurn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Compass className="w-4 h-4" />
                      <span>Hamle Yap (M)</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isMyTurn || (myBoardPlayer?.wallsLeft ?? 0) <= 0}
                      onClick={() => setActionMode('wall')}
                      className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                        actionMode === 'wall'
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      } ${
                        !isMyTurn || (myBoardPlayer?.wallsLeft ?? 0) <= 0
                          ? 'opacity-50 cursor-not-allowed'
                          : 'cursor-pointer'
                      }`}
                    >
                      <Shield className="w-4 h-4" />
                      <span>Engel Koy ({myBoardPlayer?.wallsLeft ?? 0})</span>
                    </button>

                    {actionMode === 'wall' && (
                      <button
                        type="button"
                        onClick={() =>
                          setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))
                        }
                        className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>{wallOrientation === 'H' ? 'Yatay' : 'Dikey'}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="font-mono tabular-nums">
                      Seviye {board.level} · #{board.seed}
                    </span>
                    <button
                      type="button"
                      onClick={toggleMute}
                      aria-label={muted ? 'Sesi Aç' : 'Sesi Kapat'}
                      className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700 cursor-pointer"
                    >
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Victory Banner & Next Procedural Level CTA */}
                {board.winnerSlot !== null && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Trophy className="w-7 h-7 text-amber-400 shrink-0" />
                      <div>
                        <h3 className="font-display text-lg font-bold text-slate-50">
                          {board.players.find((p) => p.slot === board.winnerSlot)?.name} Kazandı!
                        </h3>
                        <p className="text-xs text-slate-300">
                          Seviye {board.level} tamamlandı · Sıradaki seviye yeni rastgele engellerle oluşturulur.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      {isHost ? (
                        <button
                          type="button"
                          onClick={() => sendWs({ type: 'room:next_level' })}
                          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <Dices className="w-4 h-4" />
                          <span>Sonraki Seviye (Seviye {board.level + 1})</span>
                        </button>
                      ) : (
                        <span className="text-xs text-amber-200">
                          Oda sahibinin yeni seviyeyi başlatması bekleniyor...
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Game Board */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 sm:p-5">
                  <PathblockBoard
                    board={board}
                    myPlayerId={playerId}
                    actionMode={actionMode}
                    wallOrientation={wallOrientation}
                    onToggleOrientation={() =>
                      setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))
                    }
                    onAction={handleGameAction}
                    onInvalidWall={(reason) => {
                      soundFx.playError();
                      pushToast('error', reason);
                    }}
                  />
                </div>
              </section>
            )}
          </div>

          {/* RIGHT SIDEBAR: CHAT, ONLINE PLAYERS & FRIENDS (4 cols) */}
          <div className="lg:col-span-4">
            <SocialSidebar
              myId={playerId}
              onlinePlayers={onlinePlayers}
              friends={friends}
              friendRequests={friendRequests}
              globalChat={globalChat}
              currentRoom={currentRoom}
              onSendChat={(scope, text) => sendWs({ type: 'chat:send', scope, text })}
              onSendFriendRequest={(targetId) => sendWs({ type: 'friend:request', targetId })}
              onRespondFriendRequest={(fromId, accept) =>
                sendWs({ type: 'friend:respond', fromId, accept })
              }
              onRemoveFriend={(targetId) => sendWs({ type: 'friend:remove', targetId })}
              onInviteFriend={(targetId) => sendWs({ type: 'friend:invite', targetId })}
              onJoinRoom={(roomId) => sendWs({ type: 'room:join', roomId })}
            />
          </div>
        </div>
      </main>

      {/* Incoming Room Invite Floating Card */}
      {pendingInvite && (
        <div className="fixed bottom-4 right-4 z-40 w-80 rounded-2xl border border-amber-500/40 bg-slate-900 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-100">
                {pendingInvite.fromName} seni odaya davet etti
              </p>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {pendingInvite.roomTitle} · {modeLabel(pendingInvite.mode)}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sendWs({ type: 'room:join', roomId: pendingInvite.roomId });
                    setPendingInvite(null);
                  }}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 cursor-pointer"
                >
                  Katıl
                </button>
                <button
                  type="button"
                  onClick={() => setPendingInvite(null)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Reddet
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnlineBrowser && (
        <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-medium text-white shadow-lg">
          <WifiOff className="w-4 h-4" />
          <span>İnternet bağlantısı kesildi — Yeniden bağlanılıyor</span>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="fixed top-20 right-4 z-40 flex flex-col gap-2 max-w-xs pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-xl pointer-events-auto ${
              t.level === 'error'
                ? 'border-rose-500/40 bg-rose-950/95 text-rose-200'
                : t.level === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/95 text-emerald-200'
                : 'border-slate-700 bg-slate-900/95 text-slate-100'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
