import React, { useMemo, useState } from 'react';
import { Award, Ban, Compass, RotateCw, Shield, Sparkles } from 'lucide-react';
import {
  coordKey,
  getValidMoves,
  validateWallPlacement,
} from '../shared/pathblockEngine';
import type {
  GameAction,
  GameBoardState,
  Orientation,
  Wall,
} from '../shared/pathblockEngine';

interface PathblockBoardProps {
  board: GameBoardState;
  myPlayerId: string;
  actionMode: 'move' | 'wall';
  wallOrientation: Orientation;
  onToggleOrientation: () => void;
  onAction: (action: GameAction) => void;
  onInvalidWall?: (reason: string) => void;
}

export const PathblockBoard: React.FC<PathblockBoardProps> = ({
  board,
  myPlayerId,
  actionMode,
  wallOrientation,
  onToggleOrientation,
  onAction,
  onInvalidWall,
}) => {
  const [hoveredWall, setHoveredWall] = useState<{ r: number; c: number } | null>(null);

  const activePlayer = board.players[board.currentTurnIndex];
  const myPlayer = board.players.find((p) => p.id === myPlayerId) ?? null;
  const isMyTurn = Boolean(
    myPlayer && activePlayer && activePlayer.id === myPlayer.id && board.winnerSlot === null
  );

  const validMoveKeys = useMemo(() => {
    if (!isMyTurn || !myPlayer || actionMode !== 'move') return new Set<string>();
    const moves = getValidMoves(board, myPlayer.slot);
    return new Set(moves.map((m) => coordKey(m.r, m.c)));
  }, [board, isMyTurn, myPlayer, actionMode]);

  const stoneKeys = useMemo(
    () => new Set(board.stones.map((s) => coordKey(s.r, s.c))),
    [board.stones]
  );

  const bonusKeys = useMemo(
    () => new Set(board.bonusTiles.map((b) => coordKey(b.r, b.c))),
    [board.bonusTiles]
  );

  const wallPreview = useMemo(() => {
    if (!isMyTurn || actionMode !== 'wall' || !hoveredWall || !myPlayer || myPlayer.wallsLeft <= 0) {
      return null;
    }
    const check = validateWallPlacement(board, hoveredWall.r, hoveredWall.c, wallOrientation);
    return {
      r: hoveredWall.r,
      c: hoveredWall.c,
      orientation: wallOrientation,
      valid: check.valid,
      reason: check.reason,
    };
  }, [board, isMyTurn, actionMode, hoveredWall, wallOrientation, myPlayer]);

  const n = board.size;
  const trackTemplate = useMemo(
    () =>
      Array.from({ length: 2 * n - 1 }, (_, idx) =>
        idx % 2 === 0 ? 'minmax(0, 1fr)' : n >= 11 ? '8px' : '10px'
      ).join(' '),
    [n]
  );

  const getWallColor = (wall: Wall) => {
    if (wall.ownerSlot === -1) return '#64748B';
    const owner = board.players.find((p) => p.slot === wall.ownerSlot);
    return owner?.color ?? '#F59E0B';
  };

  const handleJunctionClick = (r: number, c: number) => {
    if (!isMyTurn || actionMode !== 'wall') return;
    if (!myPlayer || myPlayer.wallsLeft <= 0) {
      onInvalidWall?.('Yerleştirilecek engel hakkın kalmadı!');
      return;
    }
    const check = validateWallPlacement(board, r, c, wallOrientation);
    if (!check.valid) {
      onInvalidWall?.(check.reason || 'Bu noktaya engel konulamaz.');
      return;
    }
    setHoveredWall(null);
    onAction({ type: 'wall', r, c, orientation: wallOrientation });
  };

  // Determine goal edge owners for clear directional cues
  const topOwner = board.players.find((p) => p.goalType === 'row' && p.goalValue === 0);
  const bottomOwner = board.players.find((p) => p.goalType === 'row' && p.goalValue === n - 1);
  const rightOwner = board.players.find((p) => p.goalType === 'col' && p.goalValue === n - 1);
  const leftOwner = board.players.find((p) => p.goalType === 'col' && p.goalValue === 0);

  return (
    <div className="flex flex-col items-center w-full select-none">
      {/* Top Goal Indicator */}
      <div className="mb-2 flex items-center justify-center gap-2 h-6">
        {topOwner && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: topOwner.color }}
            />
            <span>{topOwner.name} Hedefi (Üst Kenar)</span>
          </div>
        )}
      </div>

      <div className="relative flex items-center justify-center w-full max-w-[540px]">
        {/* Left Goal Indicator */}
        {leftOwner && (
          <div
            className="hidden sm:flex flex-col items-center justify-center mr-2 text-[11px] font-medium text-slate-400"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            <span style={{ color: leftOwner.color }}>{leftOwner.name} Hedefi</span>
          </div>
        )}

        {/* Board Frame */}
        <div className="relative w-full aspect-square rounded-2xl border border-slate-700/90 bg-slate-900 p-2.5 sm:p-3.5 shadow-2xl">
          {/* Colored Goal Edge Hairlines */}
          {topOwner && (
            <div
              className="absolute top-0 left-6 right-6 h-1 rounded-b-full opacity-90"
              style={{ backgroundColor: topOwner.color }}
            />
          )}
          {bottomOwner && (
            <div
              className="absolute bottom-0 left-6 right-6 h-1 rounded-t-full opacity-90"
              style={{ backgroundColor: bottomOwner.color }}
            />
          )}
          {leftOwner && (
            <div
              className="absolute left-0 top-6 bottom-6 w-1 rounded-r-full opacity-90"
              style={{ backgroundColor: leftOwner.color }}
            />
          )}
          {rightOwner && (
            <div
              className="absolute right-0 top-6 bottom-6 w-1 rounded-l-full opacity-90"
              style={{ backgroundColor: rightOwner.color }}
            />
          )}

          {/* 2N-1 Track CSS Grid */}
          <div
            className="grid w-full h-full"
            style={{
              gridTemplateColumns: trackTemplate,
              gridTemplateRows: trackTemplate,
            }}
          >
            {/* 1. Render Cells */}
            {Array.from({ length: n }, (_, r) =>
              Array.from({ length: n }, (_, c) => {
                const k = coordKey(r, c);
                const isStone = stoneKeys.has(k);
                const isBonus = bonusKeys.has(k);
                const isValidMove = validMoveKeys.has(k);
                const pawn = board.players.find((p) => p.r === r && p.c === c);

                const isMyGoalCell =
                  myPlayer &&
                  ((myPlayer.goalType === 'row' && r === myPlayer.goalValue) ||
                    (myPlayer.goalType === 'col' && c === myPlayer.goalValue));

                return (
                  <button
                    key={`cell-${r}-${c}`}
                    type="button"
                    disabled={!isValidMove}
                    onClick={() => isValidMove && onAction({ type: 'move', r, c })}
                    style={{
                      gridRow: `${2 * r + 1} / ${2 * r + 2}`,
                      gridColumn: `${2 * c + 1} / ${2 * c + 2}`,
                    }}
                    aria-label={`Kare ${r + 1}-${c + 1}`}
                    className={`relative flex items-center justify-center rounded-md sm:rounded-lg transition-transform duration-150 ${
                      isStone
                        ? 'bg-slate-950 border border-slate-800/80 shadow-inner cursor-not-allowed'
                        : isValidMove
                        ? 'bg-emerald-500/20 border-2 border-emerald-400 hover:bg-emerald-500/35 hover:scale-[1.04] cursor-pointer shadow-sm'
                        : isMyGoalCell
                        ? 'bg-slate-800/95 border border-slate-700/80'
                        : 'bg-slate-800/65 border border-slate-700/40'
                    }`}
                  >
                    {/* Stone Pillar */}
                    {isStone && (
                      <div className="flex items-center justify-center w-3/4 h-3/4 rounded bg-slate-800/90 border border-slate-700/60 text-slate-600">
                        <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-60" />
                      </div>
                    )}

                    {/* Bonus +1 Wall Tile */}
                    {!isStone && isBonus && !pawn && (
                      <div
                        title="Bu kareye basan +1 engel hakkı kazanır"
                        className="flex items-center justify-center text-amber-400"
                      >
                        <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </div>
                    )}

                    {/* Valid Move Target Dot */}
                    {isValidMove && !pawn && (
                      <span className="h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full bg-emerald-400 shadow" />
                    )}

                    {/* Player Pawn */}
                    {pawn && (
                      <div
                        title={`${pawn.name}${pawn.isBot ? ' (Bot)' : ''}`}
                        className={`relative flex items-center justify-center w-[76%] h-[76%] rounded-full font-display font-bold text-slate-950 shadow-lg transition-transform duration-200 ${
                          activePlayer?.slot === pawn.slot
                            ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-900 scale-105'
                            : 'opacity-95'
                        }`}
                        style={{
                          backgroundColor: pawn.color,
                        }}
                      >
                        <span className="text-[10px] sm:text-xs leading-none">
                          {pawn.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })
            )}

            {/* 2. Placed Walls */}
            {board.walls.map((w, idx) => {
              const color = getWallColor(w);
              const isPreset = w.ownerSlot === -1;
              if (w.orientation === 'H') {
                return (
                  <div
                    key={`wall-${idx}`}
                    style={{
                      gridRow: `${2 * w.r + 2} / ${2 * w.r + 3}`,
                      gridColumn: `${2 * w.c + 1} / ${2 * w.c + 4}`,
                      backgroundColor: color,
                    }}
                    className={`rounded-full shadow-md pointer-events-none z-10 ${
                      isPreset ? 'opacity-80' : 'opacity-95'
                    }`}
                  />
                );
              }
              return (
                <div
                  key={`wall-${idx}`}
                  style={{
                    gridRow: `${2 * w.r + 1} / ${2 * w.r + 4}`,
                    gridColumn: `${2 * w.c + 2} / ${2 * w.c + 3}`,
                    backgroundColor: color,
                  }}
                  className={`rounded-full shadow-md pointer-events-none z-10 ${
                    isPreset ? 'opacity-80' : 'opacity-95'
                  }`}
                />
              );
            })}

            {/* 3. Wall Placement Preview */}
            {wallPreview && (
              <div
                style={{
                  gridRow:
                    wallPreview.orientation === 'H'
                      ? `${2 * wallPreview.r + 2} / ${2 * wallPreview.r + 3}`
                      : `${2 * wallPreview.r + 1} / ${2 * wallPreview.r + 4}`,
                  gridColumn:
                    wallPreview.orientation === 'H'
                      ? `${2 * wallPreview.c + 1} / ${2 * wallPreview.c + 4}`
                      : `${2 * wallPreview.c + 2} / ${2 * wallPreview.c + 3}`,
                }}
                className={`rounded-full pointer-events-none z-20 transition-opacity ${
                  wallPreview.valid
                    ? 'bg-amber-400/85 ring-2 ring-amber-300/60'
                    : 'bg-rose-500/85 ring-2 ring-rose-300/60'
                }`}
              />
            )}

            {/* 4. Interactive Wall Junction Hotspots (active when in 'wall' mode) */}
            {isMyTurn &&
              actionMode === 'wall' &&
              Array.from({ length: n - 1 }, (_, r) =>
                Array.from({ length: n - 1 }, (_, c) => (
                  <button
                    key={`junc-${r}-${c}`}
                    type="button"
                    onMouseEnter={() => setHoveredWall({ r, c })}
                    onMouseLeave={() =>
                      setHoveredWall((prev) => (prev?.r === r && prev?.c === c ? null : prev))
                    }
                    onClick={() => handleJunctionClick(r, c)}
                    style={{
                      gridRow: `${2 * r + 2} / ${2 * r + 3}`,
                      gridColumn: `${2 * c + 2} / ${2 * c + 3}`,
                    }}
                    aria-label={`Engel noktası ${r + 1}-${c + 1}`}
                    className="relative z-30 flex items-center justify-center cursor-pointer group focus:outline-none"
                  >
                    <span className="absolute w-7 h-7 sm:w-8 sm:h-8 rounded-full" />
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-500/50 group-hover:bg-amber-400 group-hover:scale-125 transition-transform" />
                  </button>
                ))
              )}
          </div>
        </div>

        {/* Right Goal Indicator */}
        {rightOwner && (
          <div
            className="hidden sm:flex flex-col items-center justify-center ml-2 text-[11px] font-medium text-slate-400"
            style={{ writingMode: 'vertical-rl' }}
          >
            <span style={{ color: rightOwner.color }}>{rightOwner.name} Hedefi</span>
          </div>
        )}
      </div>

      {/* Bottom Goal Indicator */}
      <div className="mt-2 flex items-center justify-center gap-2 h-6">
        {bottomOwner && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: bottomOwner.color }}
            />
            <span>{bottomOwner.name} Hedefi (Alt Kenar)</span>
          </div>
        )}
      </div>

      {/* Action Hint Bar */}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-400">
        {board.winnerSlot !== null ? (
          <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
            <Award className="w-4 h-4" />
            <span>{board.lastActionText}</span>
          </span>
        ) : isMyTurn ? (
          actionMode === 'move' ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
              <Compass className="w-4 h-4" />
              <span>Sıra sende · Yeşil karelerden birine dokunarak ilerle.</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
              <Shield className="w-4 h-4" />
              <span>
                Kesişim noktasına dokunarak {wallOrientation === 'H' ? 'yatay' : 'dikey'} engel koy.
              </span>
              <button
                type="button"
                onClick={onToggleOrientation}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700 cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>Döndür (R)</span>
              </button>
            </span>
          )
        ) : (
          <span>{board.lastActionText}</span>
        )}
      </div>
    </div>
  );
};
