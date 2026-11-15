import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { WebSocket, WebSocketServer } from 'ws';
import {
  applyGameAction,
  computeBotAction,
  generateProceduralLevel,
} from './src/shared/pathblockEngine.ts';
import type { DifficultyMode } from './src/shared/pathblockEngine.ts';
import type {
  ChatMessage,
  ClientToServerMessage,
  FriendEntry,
  FriendRequestEntry,
  OnlinePlayerInfo,
  PlayerStatus,
  RoomSlotMember,
  RoomState,
  RoomSummary,
  ServerToClientMessage,
} from './src/shared/protocol.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, '.data');
const STORE_PATH = path.join(DATA_DIR, 'pathblock-store.json');

interface PersistedProfile {
  id: string;
  name: string;
  wins: number;
  friends: string[];
  friendRequests: FriendRequestEntry[];
}

interface StoreFile {
  profiles: Record<string, PersistedProfile>;
}

function loadStore(): StoreFile {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      if (parsed && parsed.profiles) return parsed;
    }
  } catch (err) {
    console.error('Store load warning:', err);
  }
  return { profiles: {} };
}

const store: StoreFile = loadStore();

function saveStore() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('Store save warning:', err);
  }
}

function ensureProfile(id: string, name?: string): PersistedProfile {
  if (!store.profiles[id]) {
    store.profiles[id] = {
      id,
      name: (name || 'Oyuncu').trim().slice(0, 20) || 'Oyuncu',
      wins: 0,
      friends: [],
      friendRequests: [],
    };
    saveStore();
  } else if (name && name.trim()) {
    const clean = name.trim().slice(0, 20);
    if (store.profiles[id].name !== clean) {
      store.profiles[id].name = clean;
      saveStore();
    }
  }
  return store.profiles[id];
}

interface ClientSession {
  ws: WebSocket;
  playerId: string | null;
  roomId: string | null;
}

const sessions = new Set<ClientSession>();
const playerSockets = new Map<string, ClientSession>();
const rooms = new Map<string, RoomState>();
const roomBotTimers = new Map<string, ReturnType<typeof setTimeout>>();
const globalChat: ChatMessage[] = [
  {
    id: 'sys-welcome',
    scope: 'global',
    senderId: 'system',
    senderName: 'Pathblock Arena',
    text: 'Pathblock Arena lobisine hoş geldin! Oda kurabilir, arkadaşlarını davet edebilir veya çevrim içi rakip yoksa botlarla hemen oynayabilirsin.',
    timestamp: Date.now(),
    system: true,
  },
];

const BOT_NAMES = ['Atlas Bot', 'Kuzey Bot', 'Vega Bot', 'Mira Bot'];

function sendToSession(session: ClientSession, payload: ServerToClientMessage) {
  if (session.ws.readyState === WebSocket.OPEN) {
    session.ws.send(JSON.stringify(payload));
  }
}

function sendToPlayer(playerId: string, payload: ServerToClientMessage) {
  const s = playerSockets.get(playerId);
  if (s) sendToSession(s, payload);
}

function getPlayerStatus(playerId: string): { status: PlayerStatus; roomId: string | null } {
  const session = playerSockets.get(playerId);
  if (!session || !session.roomId) {
    return { status: 'lobby', roomId: null };
  }
  const room = rooms.get(session.roomId);
  if (!room) return { status: 'lobby', roomId: null };
  return {
    status: room.status === 'playing' ? 'playing' : 'waiting',
    roomId: room.id,
  };
}

function getOnlinePlayersList(): OnlinePlayerInfo[] {
  const list: OnlinePlayerInfo[] = [];
  for (const [playerId] of playerSockets.entries()) {
    const prof = store.profiles[playerId];
    if (!prof) continue;
    const st = getPlayerStatus(playerId);
    list.push({
      id: prof.id,
      name: prof.name,
      status: st.status,
      wins: prof.wins,
      roomId: st.roomId,
    });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
}

function toRoomSummary(room: RoomState): RoomSummary {
  return {
    id: room.id,
    title: room.title,
    hostId: room.hostId,
    hostName: room.hostName,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    level: room.level,
    status: room.status,
    members: room.members,
  };
}

function getRoomSummaries(): RoomSummary[] {
  return Array.from(rooms.values())
    .map(toRoomSummary)
    .sort((a, b) => (a.status === 'waiting' ? -1 : 1) - (b.status === 'waiting' ? -1 : 1));
}

function broadcastPresence() {
  const payload: ServerToClientMessage = {
    type: 'presence:update',
    onlinePlayers: getOnlinePlayersList(),
    rooms: getRoomSummaries(),
  };
  for (const s of sessions) {
    if (s.playerId) sendToSession(s, payload);
  }
}

function buildFriendsForPlayer(playerId: string): {
  friends: FriendEntry[];
  friendRequests: FriendRequestEntry[];
} {
  const prof = ensureProfile(playerId);
  const friends: FriendEntry[] = prof.friends
    .map((fid) => store.profiles[fid])
    .filter((fp): fp is PersistedProfile => Boolean(fp))
    .map((fp) => {
      const online = playerSockets.has(fp.id);
      const st = online ? getPlayerStatus(fp.id) : { status: 'lobby' as PlayerStatus, roomId: null };
      return {
        id: fp.id,
        name: fp.name,
        wins: fp.wins,
        online,
        status: st.status,
        roomId: st.roomId,
      };
    });

  return {
    friends,
    friendRequests: prof.friendRequests,
  };
}

function sendFriendsUpdate(playerId: string) {
  const data = buildFriendsForPlayer(playerId);
  sendToPlayer(playerId, {
    type: 'friends:update',
    friends: data.friends,
    friendRequests: data.friendRequests,
  });
}

function broadcastRoomState(room: RoomState) {
  const payload: ServerToClientMessage = {
    type: 'room:update',
    room,
  };
  for (const member of room.members) {
    if (!member.isBot) {
      sendToPlayer(member.id, payload);
    }
  }
}

function clearBotTimer(roomId: string) {
  const existing = roomBotTimers.get(roomId);
  if (existing) {
    clearTimeout(existing);
    roomBotTimers.delete(roomId);
  }
}

function addRoomSystemMessage(room: RoomState, text: string) {
  const msg: ChatMessage = {
    id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    scope: 'room',
    senderId: 'system',
    senderName: 'Sistem',
    text,
    timestamp: Date.now(),
    system: true,
  };
  room.chat.push(msg);
  if (room.chat.length > 80) room.chat.shift();
}

function createBotMember(room: RoomState): RoomSlotMember {
  const usedNames = new Set(room.members.map((m) => m.name));
  const botName = BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot #${room.members.length + 1}`;
  return {
    id: `bot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: botName,
    isBot: true,
    connected: true,
    wins: 0,
  };
}

function scheduleBotTurnIfNeeded(room: RoomState) {
  clearBotTimer(room.id);
  if (room.status !== 'playing' || !room.board || room.board.winnerSlot !== null) return;

  const activePlayer = room.board.players[room.board.currentTurnIndex];
  if (!activePlayer || !activePlayer.isBot) return;

  const timer = setTimeout(() => {
    roomBotTimers.delete(room.id);
    const currentRoom = rooms.get(room.id);
    if (!currentRoom || currentRoom.status !== 'playing' || !currentRoom.board) return;
    const currentActor = currentRoom.board.players[currentRoom.board.currentTurnIndex];
    if (!currentActor || !currentActor.isBot || currentRoom.board.winnerSlot !== null) return;

    const action = computeBotAction(currentRoom.board, currentActor.slot);
    const result = applyGameAction(currentRoom.board, currentActor.slot, action);
    if (!result.ok || !result.board) return;

    currentRoom.board = result.board;
    if (result.board.winnerSlot !== null) {
      currentRoom.status = 'finished';
      addRoomSystemMessage(currentRoom, result.board.lastActionText);
      broadcastPresence();
    }

    broadcastRoomState(currentRoom);
    scheduleBotTurnIfNeeded(currentRoom);
  }, 650);

  roomBotTimers.set(room.id, timer);
}

function startRoomMatch(room: RoomState, level: number, seed?: number) {
  // Ensure at least 2 participants; backfill with bots if solo
  while (room.members.length < 2) {
    room.members.push(createBotMember(room));
  }

  room.level = level;
  room.status = 'playing';
  room.board = generateProceduralLevel({
    level,
    mode: room.mode,
    playerDefs: room.members.map((m) => ({
      id: m.id,
      name: m.name,
      isBot: m.isBot,
      connected: m.connected,
    })),
    seed,
  });

  addRoomSystemMessage(
    room,
    `Seviye ${level} başladı (Tohum #${room.board.seed}). Tüm oyunculara başarılar!`
  );
  broadcastRoomState(room);
  broadcastPresence();
  scheduleBotTurnIfNeeded(room);
}

function leaveCurrentRoom(session: ClientSession) {
  if (!session.roomId || !session.playerId) return;
  const room = rooms.get(session.roomId);
  const playerId = session.playerId;
  session.roomId = null;

  if (!room) {
    sendToSession(session, { type: 'room:update', room: null });
    return;
  }

  const memberIdx = room.members.findIndex((m) => m.id === playerId);
  const leavingName = memberIdx >= 0 ? room.members[memberIdx].name : 'Oyuncu';

  if (room.status === 'playing' && room.board) {
    // Convert departed human into a Bot if other humans remain so match doesn't break
    const remainingHumans = room.members.filter((m) => !m.isBot && m.id !== playerId);
    if (remainingHumans.length === 0) {
      clearBotTimer(room.id);
      rooms.delete(room.id);
    } else if (memberIdx >= 0) {
      const botId = `bot-sub-${Date.now()}`;
      const botName = `${leavingName} (Bot)`;
      room.members[memberIdx] = {
        id: botId,
        name: botName,
        isBot: true,
        connected: true,
        wins: 0,
      };
      const boardPlayer = room.board.players.find((p) => p.id === playerId);
      if (boardPlayer) {
        boardPlayer.id = botId;
        boardPlayer.name = botName;
        boardPlayer.isBot = true;
      }
      if (room.hostId === playerId) {
        room.hostId = remainingHumans[0].id;
        room.hostName = remainingHumans[0].name;
      }
      addRoomSystemMessage(room, `${leavingName} odadan ayrıldı. Yerine bot devraldı.`);
      broadcastRoomState(room);
      scheduleBotTurnIfNeeded(room);
    }
  } else {
    room.members = room.members.filter((m) => m.id !== playerId);
    const remainingHumans = room.members.filter((m) => !m.isBot);
    if (remainingHumans.length === 0) {
      clearBotTimer(room.id);
      rooms.delete(room.id);
    } else {
      if (room.hostId === playerId) {
        room.hostId = remainingHumans[0].id;
        room.hostName = remainingHumans[0].name;
      }
      addRoomSystemMessage(room, `${leavingName} odadan ayrıldı.`);
      broadcastRoomState(room);
    }
  }

  sendToSession(session, { type: 'room:update', room: null });
  broadcastPresence();
}

async function createServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      onlineCount: playerSockets.size,
      roomsCount: rooms.size,
    });
  });

  app.get('/api/android-project.zip', async (req, res) => {
    try {
      const androidDir = path.join(__dirname, 'android');
      if (!fs.existsSync(androidDir)) {
        res.status(404).json({ error: 'Android proje klasörü bulunamadı.' });
        return;
      }

      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
      const liveOrigin = host ? `${proto}://${host}` : process.env.APP_URL || '';

      const zip = new JSZip();
      const addFolderToZip = (dirPath: string, zipFolder: JSZip) => {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const sub = zipFolder.folder(entry.name);
            if (sub) addFolderToZip(fullPath, sub);
          } else {
            let content = fs.readFileSync(fullPath);
            if (entry.name === 'strings.xml' && liveOrigin) {
              const xml = content
                .toString('utf8')
                .replace(/<string name="app_url">.*?<\/string>/, `<string name="app_url">${liveOrigin}</string>`);
              content = Buffer.from(xml, 'utf8');
            }
            zipFolder.file(entry.name, content);
          }
        }
      };

      const rootFolder = zip.folder('pathblock-android');
      if (rootFolder) addFolderToZip(androidDir, rootFolder);

      const buffer = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="pathblock-arena-android.zip"');
      res.send(buffer);
    } catch (err) {
      console.error('Android zip error:', err);
      res.status(500).json({ error: 'Android projesi paketlenemedi.' });
    }
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const session: ClientSession = { ws, playerId: null, roomId: null };
    sessions.add(session);

    ws.on('message', (raw) => {
      let msg: ClientToServerMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientToServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'auth:identify') {
        const cleanId = (msg.playerId || '').trim() || `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const cleanName = (msg.name || '').trim().slice(0, 20) || 'Oyuncu';
        const profile = ensureProfile(cleanId, cleanName);

        // Replace stale socket if reconnecting with same playerId
        const previous = playerSockets.get(cleanId);
        if (previous && previous !== session) {
          if (previous.roomId) {
            session.roomId = previous.roomId;
          }
          previous.playerId = null;
          previous.roomId = null;
          try {
            previous.ws.close();
          } catch {
            // ignore
          }
        }

        session.playerId = cleanId;
        playerSockets.set(cleanId, session);

        // Reconnect into existing room if still present
        let activeRoom: RoomState | null = null;
        if (session.roomId) {
          activeRoom = rooms.get(session.roomId) ?? null;
          if (!activeRoom) session.roomId = null;
        } else {
          for (const r of rooms.values()) {
            if (r.members.some((m) => m.id === cleanId)) {
              activeRoom = r;
              session.roomId = r.id;
              break;
            }
          }
        }

        if (activeRoom) {
          for (const m of activeRoom.members) {
            if (m.id === cleanId) {
              m.connected = true;
              m.name = profile.name;
            }
          }
          if (activeRoom.board) {
            for (const bp of activeRoom.board.players) {
              if (bp.id === cleanId) {
                bp.connected = true;
                bp.name = profile.name;
              }
            }
          }
          broadcastRoomState(activeRoom);
        }

        const friendData = buildFriendsForPlayer(cleanId);
        sendToSession(session, {
          type: 'init',
          playerId: profile.id,
          name: profile.name,
          wins: profile.wins,
          onlinePlayers: getOnlinePlayersList(),
          rooms: getRoomSummaries(),
          globalChat,
          friends: friendData.friends,
          friendRequests: friendData.friendRequests,
          currentRoom: activeRoom,
        });

        broadcastPresence();
        for (const fid of profile.friends) {
          if (playerSockets.has(fid)) sendFriendsUpdate(fid);
        }
        return;
      }

      if (!session.playerId) return;
      const profile = ensureProfile(session.playerId);

      if (msg.type === 'auth:rename') {
        const cleanName = (msg.name || '').trim().slice(0, 20);
        if (!cleanName) return;
        profile.name = cleanName;
        saveStore();

        if (session.roomId) {
          const room = rooms.get(session.roomId);
          if (room) {
            if (room.hostId === profile.id) room.hostName = cleanName;
            for (const m of room.members) {
              if (m.id === profile.id) m.name = cleanName;
            }
            if (room.board) {
              for (const bp of room.board.players) {
                if (bp.id === profile.id) bp.name = cleanName;
              }
            }
            broadcastRoomState(room);
          }
        }
        broadcastPresence();
        for (const fid of profile.friends) {
          if (playerSockets.has(fid)) sendFriendsUpdate(fid);
        }
        sendToSession(session, {
          type: 'toast',
          level: 'success',
          message: `Oyuncu adın "${cleanName}" olarak güncellendi.`,
        });
        return;
      }

      if (msg.type === 'room:create') {
        leaveCurrentRoom(session);
        const maxPlayers = Math.min(4, Math.max(2, Number(msg.maxPlayers) || 2));
        const mode: DifficultyMode =
          msg.mode === 'blitz' || msg.mode === 'labyrinth' ? msg.mode : 'standard';
        const roomId = `room-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const roomTitle = (msg.title || '').trim().slice(0, 28) || `${profile.name} Odası`;

        const room: RoomState = {
          id: roomId,
          title: roomTitle,
          hostId: profile.id,
          hostName: profile.name,
          mode,
          maxPlayers,
          level: Math.max(1, Number(msg.level) || 1),
          status: 'waiting',
          members: [
            {
              id: profile.id,
              name: profile.name,
              isBot: false,
              connected: true,
              wins: profile.wins,
            },
          ],
          board: null,
          chat: [],
        };

        rooms.set(roomId, room);
        session.roomId = roomId;
        addRoomSystemMessage(room, `${profile.name} odayı kurdu (${maxPlayers} kişilik).`);

        if (msg.autoFillBots) {
          while (room.members.length < maxPlayers) {
            room.members.push(createBotMember(room));
          }
          startRoomMatch(room, room.level, msg.seed);
        } else {
          broadcastRoomState(room);
          broadcastPresence();
        }
        return;
      }

      if (msg.type === 'room:quickmatch') {
        leaveCurrentRoom(session);
        const maxPlayers = Math.min(4, Math.max(2, Number(msg.maxPlayers) || 2));
        const mode: DifficultyMode =
          msg.mode === 'blitz' || msg.mode === 'labyrinth' ? msg.mode : 'standard';

        // Look for an open waiting room
        const openRoom = Array.from(rooms.values()).find(
          (r) => r.status === 'waiting' && r.members.length < r.maxPlayers
        );

        if (openRoom) {
          openRoom.members.push({
            id: profile.id,
            name: profile.name,
            isBot: false,
            connected: true,
            wins: profile.wins,
          });
          session.roomId = openRoom.id;
          addRoomSystemMessage(openRoom, `${profile.name} hızlı eşleşme ile katıldı.`);
          broadcastRoomState(openRoom);
          broadcastPresence();
          return;
        }

        // No open online room found -> create room and immediately fill with AI bots
        const roomId = `bot-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
        const room: RoomState = {
          id: roomId,
          title: `${profile.name} vs Botlar`,
          hostId: profile.id,
          hostName: profile.name,
          mode,
          maxPlayers,
          level: 1,
          status: 'waiting',
          members: [
            {
              id: profile.id,
              name: profile.name,
              isBot: false,
              connected: true,
              wins: profile.wins,
            },
          ],
          board: null,
          chat: [],
        };
        while (room.members.length < maxPlayers) {
          room.members.push(createBotMember(room));
        }
        rooms.set(roomId, room);
        session.roomId = roomId;
        addRoomSystemMessage(
          room,
          'Çevrim içi bekleyen oda bulunamadı — akıllı botlarla maç başlatıldı!'
        );
        startRoomMatch(room, 1);
        return;
      }

      if (msg.type === 'room:join') {
        const targetRoom = rooms.get(msg.roomId);
        if (!targetRoom) {
          sendToSession(session, { type: 'toast', level: 'error', message: 'Oda bulunamadı.' });
          return;
        }
        if (targetRoom.status !== 'waiting') {
          sendToSession(session, {
            type: 'toast',
            level: 'error',
            message: 'Bu odadaki oyun zaten başlamış.',
          });
          return;
        }
        if (targetRoom.members.length >= targetRoom.maxPlayers) {
          sendToSession(session, { type: 'toast', level: 'error', message: 'Oda dolu.' });
          return;
        }

        leaveCurrentRoom(session);
        targetRoom.members.push({
          id: profile.id,
          name: profile.name,
          isBot: false,
          connected: true,
          wins: profile.wins,
        });
        session.roomId = targetRoom.id;
        addRoomSystemMessage(targetRoom, `${profile.name} odaya katıldı.`);
        broadcastRoomState(targetRoom);
        broadcastPresence();
        return;
      }

      if (msg.type === 'room:leave') {
        leaveCurrentRoom(session);
        return;
      }

      if (msg.type === 'room:add_bot') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.hostId !== profile.id || room.status !== 'waiting') return;
        if (room.members.length >= room.maxPlayers) return;
        const bot = createBotMember(room);
        room.members.push(bot);
        addRoomSystemMessage(room, `${bot.name} odaya eklendi.`);
        broadcastRoomState(room);
        broadcastPresence();
        return;
      }

      if (msg.type === 'room:remove_bot') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.hostId !== profile.id || room.status !== 'waiting') return;
        room.members = room.members.filter((m) => m.id !== msg.botId);
        broadcastRoomState(room);
        broadcastPresence();
        return;
      }

      if (msg.type === 'room:start') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.hostId !== profile.id) return;
        startRoomMatch(room, room.level);
        return;
      }

      if (msg.type === 'room:next_level') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.hostId !== profile.id) return;
        const nextLevel = room.status === 'finished' ? room.level + 1 : room.level;
        startRoomMatch(room, nextLevel, msg.seed);
        return;
      }

      if (msg.type === 'game:action') {
        if (!session.roomId) return;
        const room = rooms.get(session.roomId);
        if (!room || room.status !== 'playing' || !room.board) return;

        const boardPlayer = room.board.players.find((p) => p.id === profile.id);
        if (!boardPlayer) return;

        const result = applyGameAction(room.board, boardPlayer.slot, msg.action);
        if (!result.ok || !result.board) {
          sendToSession(session, {
            type: 'toast',
            level: 'error',
            message: result.error || 'Geçersiz hamle.',
          });
          return;
        }

        room.board = result.board;
        if (result.board.winnerSlot !== null) {
          room.status = 'finished';
          const winner = result.board.players.find((p) => p.slot === result.board!.winnerSlot);
          if (winner && !winner.isBot) {
            const winProf = ensureProfile(winner.id);
            winProf.wins += 1;
            saveStore();
            const member = room.members.find((m) => m.id === winner.id);
            if (member) member.wins = winProf.wins;
          }
          addRoomSystemMessage(room, result.board.lastActionText);
          broadcastPresence();
        }

        broadcastRoomState(room);
        scheduleBotTurnIfNeeded(room);
        return;
      }

      if (msg.type === 'chat:send') {
        const cleanText = (msg.text || '').trim().slice(0, 240);
        if (!cleanText) return;

        const chatMsg: ChatMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          scope: msg.scope,
          senderId: profile.id,
          senderName: profile.name,
          text: cleanText,
          timestamp: Date.now(),
        };

        if (msg.scope === 'room' && session.roomId) {
          const room = rooms.get(session.roomId);
          if (!room) return;
          room.chat.push(chatMsg);
          if (room.chat.length > 80) room.chat.shift();
          for (const m of room.members) {
            if (!m.isBot) sendToPlayer(m.id, { type: 'chat:message', message: chatMsg });
          }
        } else {
          chatMsg.scope = 'global';
          globalChat.push(chatMsg);
          if (globalChat.length > 60) globalChat.shift();
          for (const s of sessions) {
            if (s.playerId) sendToSession(s, { type: 'chat:message', message: chatMsg });
          }
        }
        return;
      }

      if (msg.type === 'friend:request') {
        const targetId = msg.targetId;
        if (!targetId || targetId === profile.id) return;
        const targetProf = store.profiles[targetId];
        if (!targetProf) return;

        if (profile.friends.includes(targetId)) {
          sendToSession(session, {
            type: 'toast',
            level: 'info',
            message: `${targetProf.name} zaten arkadaş listende.`,
          });
          return;
        }

        // Auto-accept if target already sent us a request
        const reverseIdx = profile.friendRequests.findIndex((r) => r.fromId === targetId);
        if (reverseIdx !== -1) {
          profile.friendRequests.splice(reverseIdx, 1);
          profile.friends.push(targetId);
          if (!targetProf.friends.includes(profile.id)) targetProf.friends.push(profile.id);
          saveStore();
          sendFriendsUpdate(profile.id);
          sendFriendsUpdate(targetId);
          sendToSession(session, {
            type: 'toast',
            level: 'success',
            message: `${targetProf.name} ile arkadaş oldunuz!`,
          });
          return;
        }

        const alreadySent = targetProf.friendRequests.some((r) => r.fromId === profile.id);
        if (!alreadySent) {
          targetProf.friendRequests.push({
            fromId: profile.id,
            fromName: profile.name,
            createdAt: Date.now(),
          });
          saveStore();
          sendFriendsUpdate(targetId);
          sendToPlayer(targetId, {
            type: 'toast',
            level: 'info',
            message: `${profile.name} sana arkadaşlık isteği gönderdi.`,
          });
        }
        sendToSession(session, {
          type: 'toast',
          level: 'success',
          message: `${targetProf.name} oyuncusuna arkadaşlık isteği gönderildi.`,
        });
        return;
      }

      if (msg.type === 'friend:respond') {
        const idx = profile.friendRequests.findIndex((r) => r.fromId === msg.fromId);
        if (idx === -1) return;
        const [reqEntry] = profile.friendRequests.splice(idx, 1);
        const otherProf = store.profiles[reqEntry.fromId];

        if (msg.accept && otherProf) {
          if (!profile.friends.includes(otherProf.id)) profile.friends.push(otherProf.id);
          if (!otherProf.friends.includes(profile.id)) otherProf.friends.push(profile.id);
          sendToPlayer(otherProf.id, {
            type: 'toast',
            level: 'success',
            message: `${profile.name} arkadaşlık isteğini kabul etti!`,
          });
        }
        saveStore();
        sendFriendsUpdate(profile.id);
        if (otherProf) sendFriendsUpdate(otherProf.id);
        return;
      }

      if (msg.type === 'friend:remove') {
        const targetProf = store.profiles[msg.targetId];
        profile.friends = profile.friends.filter((id) => id !== msg.targetId);
        if (targetProf) {
          targetProf.friends = targetProf.friends.filter((id) => id !== profile.id);
        }
        saveStore();
        sendFriendsUpdate(profile.id);
        if (targetProf) sendFriendsUpdate(targetProf.id);
        return;
      }

      if (msg.type === 'friend:invite') {
        if (!session.roomId) {
          sendToSession(session, {
            type: 'toast',
            level: 'error',
            message: 'Davet göndermek için önce bir oda kurmalısın.',
          });
          return;
        }
        const room = rooms.get(session.roomId);
        if (!room || room.status !== 'waiting') {
          sendToSession(session, {
            type: 'toast',
            level: 'error',
            message: 'Sadece bekleme aşamasındaki odalara davet gönderilebilir.',
          });
          return;
        }
        if (!playerSockets.has(msg.targetId)) {
          sendToSession(session, {
            type: 'toast',
            level: 'error',
            message: 'Arkadaşın şu an çevrim dışı.',
          });
          return;
        }
        sendToPlayer(msg.targetId, {
          type: 'invite:received',
          invite: {
            roomId: room.id,
            roomTitle: room.title,
            fromId: profile.id,
            fromName: profile.name,
            mode: room.mode,
          },
        });
        sendToSession(session, {
          type: 'toast',
          level: 'success',
          message: 'Oda daveti gönderildi!',
        });
      }
    });

    ws.on('close', () => {
      sessions.delete(session);
      if (session.playerId && playerSockets.get(session.playerId) === session) {
        const pid = session.playerId;
        const prof = store.profiles[pid];
        playerSockets.delete(pid);
        if (session.roomId) {
          const room = rooms.get(session.roomId);
          if (room) {
            const member = room.members.find((m) => m.id === pid);
            if (member) member.connected = false;
            if (room.board) {
              const bp = room.board.players.find((p) => p.id === pid);
              if (bp) bp.connected = false;
            }
            // If everyone in waiting room disconnected, clean up
            const anyConnectedHuman = room.members.some((m) => !m.isBot && m.connected);
            if (!anyConnectedHuman) {
              clearBotTimer(room.id);
              rooms.delete(room.id);
            } else {
              broadcastRoomState(room);
            }
          }
        }
        broadcastPresence();
        if (prof) {
          for (const fid of prof.friends) {
            if (playerSockets.has(fid)) sendFriendsUpdate(fid);
          }
        }
      }
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Pathblock Arena server listening on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
