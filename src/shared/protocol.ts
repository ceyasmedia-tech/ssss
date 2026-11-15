import type { DifficultyMode, GameAction, GameBoardState } from './pathblockEngine.ts';

export type PlayerStatus = 'lobby' | 'waiting' | 'playing';

export interface OnlinePlayerInfo {
  id: string;
  name: string;
  status: PlayerStatus;
  wins: number;
  roomId: string | null;
}

export interface FriendEntry {
  id: string;
  name: string;
  wins: number;
  online: boolean;
  status: PlayerStatus;
  roomId: string | null;
}

export interface FriendRequestEntry {
  fromId: string;
  fromName: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  scope: 'global' | 'room';
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  system?: boolean;
}

export interface RoomSlotMember {
  id: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  wins: number;
}

export interface RoomSummary {
  id: string;
  title: string;
  hostId: string;
  hostName: string;
  mode: DifficultyMode;
  maxPlayers: number;
  level: number;
  status: 'waiting' | 'playing' | 'finished';
  members: RoomSlotMember[];
}

export interface RoomState extends RoomSummary {
  board: GameBoardState | null;
  chat: ChatMessage[];
}

export interface RoomInvite {
  roomId: string;
  roomTitle: string;
  fromId: string;
  fromName: string;
  mode: DifficultyMode;
}

export type ClientToServerMessage =
  | { type: 'auth:identify'; playerId: string; name: string }
  | { type: 'auth:rename'; name: string }
  | { type: 'room:create'; title: string; mode: DifficultyMode; maxPlayers: number; level?: number; seed?: number; autoFillBots?: boolean }
  | { type: 'room:join'; roomId: string }
  | { type: 'room:quickmatch'; mode: DifficultyMode; maxPlayers: number }
  | { type: 'room:leave' }
  | { type: 'room:add_bot' }
  | { type: 'room:remove_bot'; botId: string }
  | { type: 'room:start' }
  | { type: 'room:next_level'; seed?: number }
  | { type: 'game:action'; action: GameAction }
  | { type: 'chat:send'; scope: 'global' | 'room'; text: string }
  | { type: 'friend:request'; targetId: string }
  | { type: 'friend:respond'; fromId: string; accept: boolean }
  | { type: 'friend:remove'; targetId: string }
  | { type: 'friend:invite'; targetId: string };

export type ServerToClientMessage =
  | {
      type: 'init';
      playerId: string;
      name: string;
      wins: number;
      onlinePlayers: OnlinePlayerInfo[];
      rooms: RoomSummary[];
      globalChat: ChatMessage[];
      friends: FriendEntry[];
      friendRequests: FriendRequestEntry[];
      currentRoom: RoomState | null;
    }
  | { type: 'presence:update'; onlinePlayers: OnlinePlayerInfo[]; rooms: RoomSummary[] }
  | { type: 'friends:update'; friends: FriendEntry[]; friendRequests: FriendRequestEntry[] }
  | { type: 'room:update'; room: RoomState | null }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'invite:received'; invite: RoomInvite }
  | { type: 'toast'; level: 'info' | 'success' | 'error'; message: string };
