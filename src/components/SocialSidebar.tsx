import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  MessageSquare,
  Send,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  ChatMessage,
  FriendEntry,
  FriendRequestEntry,
  OnlinePlayerInfo,
  RoomState,
} from '../shared/protocol';

interface SocialSidebarProps {
  myId: string;
  onlinePlayers: OnlinePlayerInfo[];
  friends: FriendEntry[];
  friendRequests: FriendRequestEntry[];
  globalChat: ChatMessage[];
  currentRoom: RoomState | null;
  onSendChat: (scope: 'global' | 'room', text: string) => void;
  onSendFriendRequest: (targetId: string) => void;
  onRespondFriendRequest: (fromId: string, accept: boolean) => void;
  onRemoveFriend: (targetId: string) => void;
  onInviteFriend: (targetId: string) => void;
  onJoinRoom: (roomId: string) => void;
}

const QUICK_PHRASES = ['İyi hamle!', 'Güzel engel!', 'Harika oyun!', 'Tekrar oynayalım?'];

export const SocialSidebar: React.FC<SocialSidebarProps> = ({
  myId,
  onlinePlayers,
  friends,
  friendRequests,
  globalChat,
  currentRoom,
  onSendChat,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriend,
  onInviteFriend,
  onJoinRoom,
}) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'online' | 'friends'>('chat');
  const [chatScope, setChatScope] = useState<'global' | 'room'>(currentRoom ? 'room' : 'global');
  const [draft, setDraft] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentRoom) {
      setChatScope('room');
    } else {
      setChatScope('global');
    }
  }, [currentRoom?.id]);

  const messages = chatScope === 'room' && currentRoom ? currentRoom.chat : globalChat;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, chatScope, activeTab]);

  const friendIds = new Set(friends.map((f) => f.id));

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendChat(chatScope === 'room' && currentRoom ? 'room' : 'global', trimmed);
    setDraft('');
  };

  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const statusLabel = (st: OnlinePlayerInfo['status']) => {
    if (st === 'playing') return 'Oyunda';
    if (st === 'waiting') return 'Odada';
    return 'Lobide';
  };

  return (
    <aside className="flex flex-col h-[520px] lg:h-[640px] rounded-2xl border border-slate-800 bg-slate-900/95 overflow-hidden">
      {/* Segmented Navigation Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1.5 border-b border-slate-800 bg-slate-950/60">
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-slate-800 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5 shrink-0" />
          <span>Sohbet</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('online')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'online'
              ? 'bg-slate-800 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-3.5 h-3.5 shrink-0" />
          <span>Çevrim İçi ({onlinePlayers.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('friends')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
            activeTab === 'friends'
              ? 'bg-slate-800 text-slate-50 shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5 shrink-0" />
          <span>
            Arkadaşlar ({friends.length})
            {friendRequests.length > 0 ? ` · ${friendRequests.length}` : ''}
          </span>
        </button>
      </div>

      {/* TAB 1: CHAT */}
      {activeTab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0">
          {currentRoom && (
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/80 bg-slate-900">
              <button
                type="button"
                onClick={() => setChatScope('room')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  chatScope === 'room'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Oda Sohbeti
              </button>
              <button
                type="button"
                onClick={() => setChatScope('global')}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  chatScope === 'global'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Genel Lobi
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-500">
                Henüz mesaj yok. İlk selamı sen ver!
              </div>
            ) : (
              messages.map((m) => {
                if (m.system) {
                  return (
                    <div
                      key={m.id}
                      className="rounded-lg bg-slate-800/50 px-3 py-1.5 text-[11px] text-slate-400 leading-relaxed"
                    >
                      {m.text}
                    </div>
                  );
                }
                const isMine = m.senderId === myId;
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-0.5 px-1">
                      <span className="font-medium text-slate-300">
                        {isMine ? 'Sen' : m.senderName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[10px]">{formatTime(m.timestamp)}</span>
                    </div>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed break-words ${
                        isMine
                          ? 'bg-amber-500 text-slate-950 font-medium rounded-tr-sm'
                          : 'bg-slate-800 text-slate-100 rounded-tl-sm'
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Replies */}
          <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 border-t border-slate-800/70">
            {QUICK_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                onClick={() =>
                  onSendChat(chatScope === 'room' && currentRoom ? 'room' : 'global', phrase)
                }
                className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {phrase}
              </button>
            ))}
          </div>

          <form
            onSubmit={handleSend}
            className="flex items-center gap-2 p-2.5 border-t border-slate-800 bg-slate-950/50"
          >
            <input
              type="text"
              maxLength={240}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                chatScope === 'room' && currentRoom ? 'Odaya mesaj yaz...' : 'Lobiye mesaj yaz...'
              }
              className="flex-1 min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              aria-label="Gönder"
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* TAB 2: ONLINE PLAYERS */}
      {activeTab === 'online' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {onlinePlayers.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              Şu an başka çevrim içi oyuncu görünmüyor.
            </p>
          ) : (
            onlinePlayers.map((p) => {
              const isMe = p.id === myId;
              const isFriend = friendIds.has(p.id);
              const canInvite =
                !isMe &&
                currentRoom &&
                currentRoom.status === 'waiting' &&
                !currentRoom.members.some((m) => m.id === p.id);

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100 truncate">
                      <span className="truncate">{p.name}</span>
                      {isMe && <span className="text-[11px] text-amber-400">(Sen)</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                      <span>{statusLabel(p.status)}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{p.wins} galibiyet</span>
                    </div>
                  </div>

                  {!isMe && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canInvite && (
                        <button
                          type="button"
                          onClick={() => onInviteFriend(p.id)}
                          className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 whitespace-nowrap cursor-pointer"
                        >
                          Davet Et
                        </button>
                      )}
                      {!isFriend ? (
                        <button
                          type="button"
                          onClick={() => onSendFriendRequest(p.id)}
                          title="Arkadaş Ekle"
                          className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Ekle</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-400 px-1.5">Arkadaş</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: FRIENDS & REQUESTS */}
      {activeTab === 'friends' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {friendRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-amber-300">
                Gelen Arkadaşlık İstekleri ({friendRequests.length})
              </h3>
              {friendRequests.map((req) => (
                <div
                  key={req.fromId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-100 truncate">
                      {req.fromName}
                    </div>
                    <div className="text-[11px] text-slate-400">Arkadaş olmak istiyor</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onRespondFriendRequest(req.fromId, true)}
                      aria-label="Kabul Et"
                      className="rounded-lg bg-emerald-500 p-1.5 text-slate-950 hover:bg-emerald-400 cursor-pointer"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRespondFriendRequest(req.fromId, false)}
                      aria-label="Reddet"
                      className="rounded-lg bg-slate-800 p-1.5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400">
              Arkadaş Listen ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <p className="text-xs text-slate-500 leading-relaxed py-4">
                Henüz arkadaşın yok. <strong>Çevrim İçi</strong> sekmesinden aktif oyunculara arkadaşlık isteği gönderebilirsin.
              </p>
            ) : (
              friends.map((f) => {
                const canInvite =
                  f.online &&
                  currentRoom &&
                  currentRoom.status === 'waiting' &&
                  !currentRoom.members.some((m) => m.id === f.id);
                const canJoin = f.online && f.status === 'waiting' && f.roomId && f.roomId !== currentRoom?.id;

                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-800/80 bg-slate-950/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-100 truncate">{f.name}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                        <span className={f.online ? 'text-emerald-400' : 'text-slate-500'}>
                          {f.online ? statusLabel(f.status) : 'Çevrim dışı'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{f.wins} galibiyet</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canInvite && (
                        <button
                          type="button"
                          onClick={() => onInviteFriend(f.id)}
                          className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-2.5 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 whitespace-nowrap cursor-pointer"
                        >
                          Davet
                        </button>
                      )}
                      {canJoin && f.roomId && (
                        <button
                          type="button"
                          onClick={() => onJoinRoom(f.roomId!)}
                          className="rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1.5 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 whitespace-nowrap cursor-pointer"
                        >
                          Katıl
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onRemoveFriend(f.id)}
                        title="Arkadaşlıktan Çıkar"
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
