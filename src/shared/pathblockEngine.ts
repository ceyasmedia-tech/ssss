export type Orientation = 'H' | 'V';
export type DifficultyMode = 'blitz' | 'standard' | 'labyrinth';

export interface Coord {
  r: number;
  c: number;
}

export interface Wall {
  r: number;
  c: number;
  orientation: Orientation;
  ownerSlot: number; // -1 for procedural level walls
}

export interface PlayerState {
  slot: number;
  id: string;
  name: string;
  isBot: boolean;
  r: number;
  c: number;
  goalType: 'row' | 'col';
  goalValue: number;
  wallsLeft: number;
  color: string;
  label: string;
  movesCount: number;
  connected: boolean;
}

export interface GameBoardState {
  size: number;
  level: number;
  seed: number;
  difficulty: DifficultyMode;
  stones: Coord[];
  bonusTiles: Coord[];
  walls: Wall[];
  players: PlayerState[];
  currentTurnIndex: number;
  winnerSlot: number | null;
  turnNumber: number;
  lastActionText: string;
}

export type GameAction =
  | { type: 'move'; r: number; c: number }
  | { type: 'wall'; r: number; c: number; orientation: Orientation };

export const SLOT_COLORS = ['#10B981', '#F43F5E', '#38BDF8', '#F59E0B'] as const;
export const SLOT_LABELS = ['Zümrüt', 'Mercan', 'Gök', 'Kehribar'] as const;

export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getGridSizeForMode(mode: DifficultyMode): number {
  if (mode === 'blitz') return 7;
  if (mode === 'labyrinth') return 11;
  return 9;
}

export function getInitialWallsPerPlayer(mode: DifficultyMode, playerCount: number): number {
  const base = mode === 'blitz' ? 6 : mode === 'labyrinth' ? 12 : 10;
  if (playerCount === 2) return base;
  if (playerCount === 3) return Math.max(5, Math.floor(base * 0.75));
  return Math.max(4, Math.floor(base * 0.6));
}

export function getSpawnConfig(size: number, slot: number): {
  r: number;
  c: number;
  goalType: 'row' | 'col';
  goalValue: number;
} {
  const mid = Math.floor(size / 2);
  if (slot === 0) return { r: size - 1, c: mid, goalType: 'row', goalValue: 0 };
  if (slot === 1) return { r: 0, c: mid, goalType: 'row', goalValue: size - 1 };
  if (slot === 2) return { r: mid, c: 0, goalType: 'col', goalValue: size - 1 };
  return { r: mid, c: size - 1, goalType: 'col', goalValue: 0 };
}

export function coordKey(r: number, c: number): string {
  return `${r},${c}`;
}

export function isGoalReached(player: Pick<PlayerState, 'r' | 'c' | 'goalType' | 'goalValue'>): boolean {
  return player.goalType === 'row' ? player.r === player.goalValue : player.c === player.goalValue;
}

export function isWallBlockingStep(
  walls: Wall[],
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  if (r1 === r2 && Math.abs(c1 - c2) === 1) {
    const minC = Math.min(c1, c2);
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.orientation === 'V' && w.c === minC && (w.r === r1 || w.r === r1 - 1)) {
        return true;
      }
    }
  } else if (c1 === c2 && Math.abs(r1 - r2) === 1) {
    const minR = Math.min(r1, r2);
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.orientation === 'H' && w.r === minR && (w.c === c1 || w.c === c1 - 1)) {
        return true;
      }
    }
  }
  return false;
}

export function canStepBetween(
  size: number,
  stonesSet: Set<string>,
  walls: Wall[],
  r1: number,
  c1: number,
  r2: number,
  c2: number
): boolean {
  if (r2 < 0 || r2 >= size || c2 < 0 || c2 >= size) return false;
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  if (stonesSet.has(coordKey(r2, c2))) return false;
  return !isWallBlockingStep(walls, r1, c1, r2, c2);
}

/**
 * Shortest path distance and first-step parents via BFS (ignoring other pawns for path-existence invariant).
 */
export function findShortestPath(
  size: number,
  stones: Coord[],
  walls: Wall[],
  startR: number,
  startC: number,
  goalType: 'row' | 'col',
  goalValue: number
): { distance: number; path: Coord[] } {
  const stonesSet = new Set(stones.map((s) => coordKey(s.r, s.c)));
  const visited = new Uint8Array(size * size);
  const parent = new Int16Array(size * size).fill(-1);
  const queueR: number[] = [startR];
  const queueC: number[] = [startC];
  const queueD: number[] = [0];
  visited[startR * size + startC] = 1;

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  let head = 0;
  while (head < queueR.length) {
    const r = queueR[head];
    const c = queueC[head];
    const d = queueD[head];
    head++;

    if ((goalType === 'row' && r === goalValue) || (goalType === 'col' && c === goalValue)) {
      const path: Coord[] = [];
      let cur = r * size + c;
      while (cur !== -1) {
        path.push({ r: Math.floor(cur / size), c: cur % size });
        cur = parent[cur];
      }
      path.reverse();
      return { distance: d, path };
    }

    for (let i = 0; i < 4; i++) {
      const nr = r + dirs[i][0];
      const nc = c + dirs[i][1];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      const nIdx = nr * size + nc;
      if (visited[nIdx]) continue;
      if (!canStepBetween(size, stonesSet, walls, r, c, nr, nc)) continue;
      visited[nIdx] = 1;
      parent[nIdx] = r * size + c;
      queueR.push(nr);
      queueC.push(nc);
      queueD.push(d + 1);
    }
  }

  return { distance: Infinity, path: [] };
}

export function getValidMoves(board: GameBoardState, playerSlot: number): Coord[] {
  const player = board.players.find((p) => p.slot === playerSlot);
  if (!player) return [];

  const stonesSet = new Set(board.stones.map((s) => coordKey(s.r, s.c)));
  const occupied = new Map<string, number>();
  for (const p of board.players) {
    occupied.set(coordKey(p.r, p.c), p.slot);
  }

  const moves: Coord[] = [];
  const added = new Set<string>();
  const addMove = (r: number, c: number) => {
    const k = coordKey(r, c);
    if (!added.has(k)) {
      added.add(k);
      moves.push({ r, c });
    }
  };

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dr, dc] of dirs) {
    const nr = player.r + dr;
    const nc = player.c + dc;
    if (!canStepBetween(board.size, stonesSet, board.walls, player.r, player.c, nr, nc)) {
      continue;
    }

    const occKey = coordKey(nr, nc);
    if (!occupied.has(occKey)) {
      addMove(nr, nc);
    } else {
      // Jump over adjacent pawn
      const jr = nr + dr;
      const jc = nc + dc;
      if (
        canStepBetween(board.size, stonesSet, board.walls, nr, nc, jr, jc) &&
        !occupied.has(coordKey(jr, jc))
      ) {
        addMove(jr, jc);
      } else {
        // Diagonal sidestep if straight jump is blocked
        const perp = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
        for (const [pdr, pdc] of perp) {
          const sr = nr + pdr;
          const sc = nc + pdc;
          if (
            canStepBetween(board.size, stonesSet, board.walls, nr, nc, sr, sc) &&
            !occupied.has(coordKey(sr, sc))
          ) {
            addMove(sr, sc);
          }
        }
      }
    }
  }

  return moves;
}

export function doesWallOverlap(walls: Wall[], r: number, c: number, orientation: Orientation, size: number): boolean {
  if (r < 0 || r >= size - 1 || c < 0 || c >= size - 1) return true;
  for (const w of walls) {
    if (w.r === r && w.c === c) return true; // same slot or crossing center
    if (orientation === 'H' && w.orientation === 'H' && w.r === r && Math.abs(w.c - c) === 1) {
      return true;
    }
    if (orientation === 'V' && w.orientation === 'V' && w.c === c && Math.abs(w.r - r) === 1) {
      return true;
    }
  }
  return false;
}

export function validateWallPlacement(
  board: GameBoardState,
  r: number,
  c: number,
  orientation: Orientation
): { valid: boolean; reason?: string } {
  if (doesWallOverlap(board.walls, r, c, orientation, board.size)) {
    return { valid: false, reason: 'Bu konumda başka bir engel bulunuyor.' };
  }

  const nextWalls: Wall[] = [...board.walls, { r, c, orientation, ownerSlot: -1 }];
  for (const p of board.players) {
    const res = findShortestPath(board.size, board.stones, nextWalls, p.r, p.c, p.goalType, p.goalValue);
    if (!Number.isFinite(res.distance)) {
      return { valid: false, reason: `${p.name} oyuncusunun hedef yolu tamamen kapanamaz!` };
    }
  }

  return { valid: true };
}

/**
 * Procedural Level Generator with BFS Solvability Guarantee.
 */
export function generateProceduralLevel(params: {
  level: number;
  mode: DifficultyMode;
  playerDefs: Array<{ id: string; name: string; isBot: boolean; connected: boolean }>;
  seed?: number;
}): GameBoardState {
  const size = getGridSizeForMode(params.mode);
  const seed = params.seed ?? Math.floor(Math.random() * 899999 + 100000);
  const rng = createSeededRng(seed + params.level * 7919);
  const playerCount = params.playerDefs.length;
  const wallsPerPlayer = getInitialWallsPerPlayer(params.mode, playerCount);

  const players: PlayerState[] = params.playerDefs.map((def, idx) => {
    const sp = getSpawnConfig(size, idx);
    return {
      slot: idx,
      id: def.id,
      name: def.name,
      isBot: def.isBot,
      r: sp.r,
      c: sp.c,
      goalType: sp.goalType,
      goalValue: sp.goalValue,
      wallsLeft: wallsPerPlayer,
      color: SLOT_COLORS[idx % SLOT_COLORS.length],
      label: SLOT_LABELS[idx % SLOT_LABELS.length],
      movesCount: 0,
      connected: def.connected,
    };
  });

  const spawnKeys = new Set(players.map((p) => coordKey(p.r, p.c)));
  const stones: Coord[] = [];
  const stonesSet = new Set<string>();
  const walls: Wall[] = [];

  // Target obstacle count scales with level and board size
  const innerArea = (size - 2) * (size - 2);
  const targetStones = Math.min(
    Math.floor(innerArea * 0.22),
    Math.floor(size * 0.65) + Math.min(8, params.level - 1)
  );
  const targetPresetWalls =
    params.mode === 'labyrinth'
      ? 4 + Math.min(6, params.level)
      : params.level >= 2
      ? Math.min(5, Math.floor(params.level / 2) + 1)
      : 1;

  // 1. Place procedural stone pillars while guaranteeing all players still have open paths
  let attempts = 0;
  while (stones.length < targetStones && attempts < 220) {
    attempts++;
    const r = Math.floor(rng() * size);
    const c = Math.floor(rng() * size);
    const k = coordKey(r, c);
    if (spawnKeys.has(k) || stonesSet.has(k)) continue;
    // Avoid blocking goal edge cells completely near spawns
    const nearSpawn = players.some((p) => Math.abs(p.r - r) + Math.abs(p.c - c) <= 1);
    if (nearSpawn) continue;

    stones.push({ r, c });
    stonesSet.add(k);

    let allReachable = true;
    for (const p of players) {
      const pathRes = findShortestPath(size, stones, walls, p.r, p.c, p.goalType, p.goalValue);
      if (!Number.isFinite(pathRes.distance)) {
        allReachable = false;
        break;
      }
    }

    if (!allReachable) {
      stones.pop();
      stonesSet.delete(k);
    }
  }

  // 2. Place procedural preset walls to create interesting tactical corridors
  let wallAttempts = 0;
  let placedPreset = 0;
  while (placedPreset < targetPresetWalls && wallAttempts < 150) {
    wallAttempts++;
    const r = Math.floor(rng() * (size - 1));
    const c = Math.floor(rng() * (size - 1));
    const orientation: Orientation = rng() < 0.5 ? 'H' : 'V';
    if (doesWallOverlap(walls, r, c, orientation, size)) continue;

    const candidateWalls: Wall[] = [...walls, { r, c, orientation, ownerSlot: -1 }];
    let allReachable = true;
    for (const p of players) {
      const pathRes = findShortestPath(size, stones, candidateWalls, p.r, p.c, p.goalType, p.goalValue);
      if (!Number.isFinite(pathRes.distance)) {
        allReachable = false;
        break;
      }
    }
    if (allReachable) {
      walls.push({ r, c, orientation, ownerSlot: -1 });
      placedPreset++;
    }
  }

  // 3. Place 2-3 bonus "+1 Engel" tiles in non-spawn, non-stone cells
  const bonusTiles: Coord[] = [];
  const bonusTarget = size >= 9 ? 3 : 2;
  let bonusAttempts = 0;
  while (bonusTiles.length < bonusTarget && bonusAttempts < 100) {
    bonusAttempts++;
    const r = 1 + Math.floor(rng() * (size - 2));
    const c = 1 + Math.floor(rng() * (size - 2));
    const k = coordKey(r, c);
    if (spawnKeys.has(k) || stonesSet.has(k)) continue;
    if (bonusTiles.some((b) => b.r === r && b.c === c)) continue;
    bonusTiles.push({ r, c });
  }

  return {
    size,
    level: params.level,
    seed,
    difficulty: params.mode,
    stones,
    bonusTiles,
    walls,
    players,
    currentTurnIndex: 0,
    winnerSlot: null,
    turnNumber: 1,
    lastActionText: `Seviye ${params.level} oluşturuldu (Tohum #${seed}). İlk hamle ${players[0]?.name ?? 'Oyuncu 1'}.`,
  };
}

export function applyGameAction(
  board: GameBoardState,
  playerSlot: number,
  action: GameAction
): { ok: boolean; error?: string; board?: GameBoardState; bonusCollected?: boolean } {
  if (board.winnerSlot !== null) {
    return { ok: false, error: 'Oyun zaten tamamlandı.' };
  }

  const currentPlayer = board.players[board.currentTurnIndex];
  if (!currentPlayer || currentPlayer.slot !== playerSlot) {
    return { ok: false, error: 'Şu an sizin sıranız değil.' };
  }

  const nextPlayers = board.players.map((p) => ({ ...p }));
  const actor = nextPlayers[board.currentTurnIndex];
  let nextWalls = board.walls;
  let nextBonusTiles = board.bonusTiles;
  let winnerSlot: number | null = null;
  let bonusCollected = false;
  let actionText = '';

  if (action.type === 'move') {
    const validMoves = getValidMoves(board, playerSlot);
    const isAllowed = validMoves.some((m) => m.r === action.r && m.c === action.c);
    if (!isAllowed) {
      return { ok: false, error: 'Geçersiz hamle konumu.' };
    }

    actor.r = action.r;
    actor.c = action.c;
    actor.movesCount += 1;

    const bonusIdx = board.bonusTiles.findIndex((b) => b.r === action.r && b.c === action.c);
    if (bonusIdx !== -1) {
      nextBonusTiles = board.bonusTiles.filter((_, idx) => idx !== bonusIdx);
      actor.wallsLeft += 1;
      bonusCollected = true;
    }

    if (isGoalReached(actor)) {
      winnerSlot = actor.slot;
      actionText = `${actor.name} hedefe ulaştı ve Seviye ${board.level} turunu kazandı!`;
    } else {
      actionText = bonusCollected
        ? `${actor.name} ilerledi ve +1 engel bonusu kaptı!`
        : `${actor.name} yeni kareye ilerledi.`;
    }
  } else {
    if (actor.wallsLeft <= 0) {
      return { ok: false, error: 'Yerleştirilecek engel hakkınız kalmadı.' };
    }
    const wallCheck = validateWallPlacement(board, action.r, action.c, action.orientation);
    if (!wallCheck.valid) {
      return { ok: false, error: wallCheck.reason };
    }
    actor.wallsLeft -= 1;
    actor.movesCount += 1;
    nextWalls = [
      ...board.walls,
      { r: action.r, c: action.c, orientation: action.orientation, ownerSlot: actor.slot },
    ];
    const dirLabel = action.orientation === 'H' ? 'yatay' : 'dikey';
    actionText = `${actor.name} (${action.r + 1},${action.c + 1}) noktasına ${dirLabel} engel koydu.`;
  }

  const nextTurnIndex =
    winnerSlot !== null ? board.currentTurnIndex : (board.currentTurnIndex + 1) % nextPlayers.length;

  return {
    ok: true,
    bonusCollected,
    board: {
      ...board,
      players: nextPlayers,
      walls: nextWalls,
      bonusTiles: nextBonusTiles,
      currentTurnIndex: nextTurnIndex,
      winnerSlot,
      turnNumber: board.turnNumber + 1,
      lastActionText: actionText,
    },
  };
}

/**
 * Smart BFS-based Bot AI: races along shortest path or drops high-impact walls against leading rival.
 */
export function computeBotAction(board: GameBoardState, botSlot: number): GameAction {
  const bot = board.players.find((p) => p.slot === botSlot);
  if (!bot) return { type: 'move', r: 0, c: 0 };

  const validMoves = getValidMoves(board, botSlot);
  const myPathInfo = findShortestPath(
    board.size,
    board.stones,
    board.walls,
    bot.r,
    bot.c,
    bot.goalType,
    bot.goalValue
  );

  // Instant win check
  for (const mv of validMoves) {
    if (isGoalReached({ r: mv.r, c: mv.c, goalType: bot.goalType, goalValue: bot.goalValue })) {
      return { type: 'move', r: mv.r, c: mv.c };
    }
  }

  // Evaluate opponents
  const opponents = board.players.filter((p) => p.slot !== botSlot);
  let closestOpp = opponents[0];
  let closestOppPath = closestOpp
    ? findShortestPath(
        board.size,
        board.stones,
        board.walls,
        closestOpp.r,
        closestOpp.c,
        closestOpp.goalType,
        closestOpp.goalValue
      )
    : { distance: Infinity, path: [] as Coord[] };

  for (let i = 1; i < opponents.length; i++) {
    const opp = opponents[i];
    const res = findShortestPath(
      board.size,
      board.stones,
      board.walls,
      opp.r,
      opp.c,
      opp.goalType,
      opp.goalValue
    );
    if (res.distance < closestOppPath.distance) {
      closestOpp = opp;
      closestOppPath = res;
    }
  }

  // Consider placing a wall if an opponent is close or ahead
  if (
    bot.wallsLeft > 0 &&
    closestOpp &&
    closestOppPath.path.length >= 2 &&
    (closestOppPath.distance <= myPathInfo.distance || closestOppPath.distance <= 3)
  ) {
    let bestWall: { r: number; c: number; orientation: Orientation; score: number } | null = null;
    const targetCells = closestOppPath.path.slice(0, 3);
    const candidateCoords = new Set<string>();

    for (const cell of targetCells) {
      for (let dr = -1; dr <= 0; dr++) {
        for (let dc = -1; dc <= 0; dc++) {
          const wr = cell.r + dr;
          const wc = cell.c + dc;
          if (wr >= 0 && wr < board.size - 1 && wc >= 0 && wc < board.size - 1) {
            candidateCoords.add(`${wr},${wc}`);
          }
        }
      }
    }

    for (const key of candidateCoords) {
      const [wr, wc] = key.split(',').map(Number);
      for (const orientation of ['H', 'V'] as const) {
        const check = validateWallPlacement(board, wr, wc, orientation);
        if (!check.valid) continue;
        const testWalls: Wall[] = [...board.walls, { r: wr, c: wc, orientation, ownerSlot: botSlot }];
        const newOppDist = findShortestPath(
          board.size,
          board.stones,
          testWalls,
          closestOpp.r,
          closestOpp.c,
          closestOpp.goalType,
          closestOpp.goalValue
        ).distance;
        const newBotDist = findShortestPath(
          board.size,
          board.stones,
          testWalls,
          bot.r,
          bot.c,
          bot.goalType,
          bot.goalValue
        ).distance;
        const oppDelta = newOppDist - closestOppPath.distance;
        const botDelta = newBotDist - myPathInfo.distance;
        const score = oppDelta - botDelta * 1.25;
        if (oppDelta >= 2 && (!bestWall || score > bestWall.score)) {
          bestWall = { r: wr, c: wc, orientation, score };
        }
      }
    }

    if (bestWall && bestWall.score >= 1.5) {
      return {
        type: 'wall',
        r: bestWall.r,
        c: bestWall.c,
        orientation: bestWall.orientation,
      };
    }
  }

  // Otherwise choose the valid move that minimizes distance to goal (or collects adjacent bonus)
  let bestMove = validMoves[0] ?? { r: bot.r, c: bot.c };
  let bestScore = Infinity;

  for (const mv of validMoves) {
    const pathAfter = findShortestPath(
      board.size,
      board.stones,
      board.walls,
      mv.r,
      mv.c,
      bot.goalType,
      bot.goalValue
    );
    const hasBonus = board.bonusTiles.some((b) => b.r === mv.r && b.c === mv.c);
    const score = pathAfter.distance - (hasBonus ? 0.6 : 0);
    if (score < bestScore) {
      bestScore = score;
      bestMove = mv;
    }
  }

  return { type: 'move', r: bestMove.r, c: bestMove.c };
}
