'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Chess } from 'chess.js';
import { Trash2, Download, Dumbbell, BookOpen } from 'lucide-react';
import {
  getRepertoire,
  addRepertoireMove,
  deleteRepertoireMove,
  importFromGames,
  type ImportCandidate,
} from '@/lib/library';
import type { RepertoireMove } from '@/types';

const Chessboard = dynamic(
  () => import('react-chessboard').then((m) => m.Chessboard),
  { ssr: false },
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TreeNode {
  san: string;
  fen: string;         // FEN after this move
  fenBefore: string;   // FEN before this move (key for repertoire lookup)
  isPlayer: boolean;
  moveNum: number;
  children: TreeNode[];
}

type Mode = 'build' | 'drill';

interface Props {
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normFen(f: string) {
  return f.split(' ').slice(0, 4).join(' ');
}

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function buildTree(
  fen: string,
  prepMap: Map<string, { san: string; move: string }>,
  playerColor: 'white' | 'black',
  depth = 0,
): TreeNode[] {
  if (depth > 30) return [];

  const c = new Chess(fen);
  const isPlayerTurn = (c.turn() === 'w') === (playerColor === 'white');

  if (isPlayerTurn) {
    const prep = prepMap.get(normFen(fen));
    if (!prep) return [];
    const from = prep.move.slice(0, 2);
    const to   = prep.move.slice(2, 4);
    const promo = prep.move.length > 4 ? prep.move[4] : undefined;
    let moved;
    try { moved = c.move({ from, to, ...(promo ? { promotion: promo } : {}) }); }
    catch { return []; }
    if (!moved) return [];
    const newFen = c.fen();
    return [{
      san: prep.san,
      fen: newFen,
      fenBefore: fen,
      isPlayer: true,
      moveNum: c.moveNumber(),
      children: buildTree(newFen, prepMap, playerColor, depth + 1),
    }];
  } else {
    // Opponent's turn — find all legal moves that lead to positions with prep
    const legal = c.moves({ verbose: true });
    const result: TreeNode[] = [];
    for (const lm of legal) {
      const copy = new Chess(fen);
      copy.move(lm);
      const newFen = copy.fen();
      const sub = buildTree(newFen, prepMap, playerColor, depth + 1);
      if (sub.length > 0) {
        result.push({
          san: lm.san,
          fen: newFen,
          fenBefore: fen,
          isPlayer: false,
          moveNum: copy.moveNumber(),
          children: sub,
        });
      }
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Tree renderer
// ---------------------------------------------------------------------------
function TreeView({
  nodes,
  depth = 0,
  onNavigate,
  activeFen,
  onDelete,
  playerColor,
}: {
  nodes: TreeNode[];
  depth?: number;
  onNavigate: (fen: string) => void;
  activeFen: string;
  onDelete: (fenBefore: string) => void;
  playerColor: 'white' | 'black';
}) {
  if (nodes.length === 0) return null;

  return (
    <div className={depth > 0 ? 'ml-3 border-l border-white/10 pl-2' : ''}>
      {nodes.map((node, i) => {
        const isActive = normFen(node.fen) === normFen(activeFen);
        const movePrefix = node.isPlayer
          ? (playerColor === 'white'
              ? `${node.moveNum}.`
              : `${node.moveNum - 1}…`)
          : null;

        return (
          <div key={i} className="mt-0.5">
            <div className="flex items-center gap-1 group">
              {/* Connector symbol for opponent branches */}
              {!node.isPlayer && depth > 0 && (
                <span className="text-white/20 text-xs shrink-0">↳</span>
              )}
              {movePrefix && (
                <span className="text-white/30 text-xs font-mono shrink-0">{movePrefix}</span>
              )}
              <button
                onClick={() => onNavigate(node.fen)}
                className={`text-sm font-mono px-1 py-0.5 rounded transition-colors ${
                  node.isPlayer
                    ? isActive
                      ? 'text-white font-bold bg-white/15'
                      : 'text-white font-semibold hover:bg-white/10'
                    : isActive
                      ? 'text-white/70 bg-white/10'
                      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`}
              >
                {node.san}
              </button>
              {/* Delete button — only on player moves */}
              {node.isPlayer && (
                <button
                  onClick={() => onDelete(node.fenBefore)}
                  className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all ml-auto shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            <TreeView
              nodes={node.children}
              depth={depth + 1}
              onNavigate={onNavigate}
              activeFen={activeFen}
              onDelete={onDelete}
              playerColor={playerColor}
            />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function RepertoirePanel({ onBack }: Props) {
  const [color, setColor]           = useState<'white' | 'black'>('white');
  const [mode, setMode]             = useState<Mode>('build');
  const [moves, setMoves]           = useState<RepertoireMove[]>([]);
  const [chess, setChess]           = useState(() => new Chess());
  const [fen, setFen]               = useState(STARTING_FEN);
  const [history, setHistory]       = useState<string[]>([]);
  const [importing, setImporting]   = useState(false);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);

  // Drill state
  const [drillResult, setDrillResult]         = useState<'correct' | 'wrong' | null>(null);
  const [drillScore, setDrillScore]           = useState({ correct: 0, total: 0 });
  const [drillExpected, setDrillExpected]     = useState<string | null>(null); // san of correct prep
  const [drillPreFen, setDrillPreFen]         = useState<string | null>(null); // fen to revert to on wrong

  // ---------------------------------------------------------------------------
  // Load repertoire
  // ---------------------------------------------------------------------------
  const loadRepertoire = useCallback(async () => {
    try { setMoves(await getRepertoire(color)); }
    catch (e) { console.error('Failed to load repertoire', e); }
  }, [color]);

  useEffect(() => {
    loadRepertoire();
    resetBoard();
  }, [color]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Prep map & tree (memoised)
  // ---------------------------------------------------------------------------
  const prepMap = useMemo(() => {
    const m = new Map<string, { san: string; move: string }>();
    moves.forEach(mv => m.set(normFen(mv.fen), { san: mv.san, move: mv.move }));
    return m;
  }, [moves]);

  const tree = useMemo(
    () => buildTree(STARTING_FEN, prepMap, color),
    [prepMap, color],
  );

  const prepAtCurrent = prepMap.get(normFen(fen)) ?? null;

  // ---------------------------------------------------------------------------
  // Board reset
  // ---------------------------------------------------------------------------
  function resetBoard() {
    setChess(new Chess());
    setFen(STARTING_FEN);
    setHistory([]);
    setDrillResult(null);
    setDrillExpected(null);
    setDrillPreFen(null);
  }

  function navigateTo(targetFen: string) {
    setChess(new Chess(targetFen));
    setFen(targetFen);
    setDrillResult(null);
  }

  // ---------------------------------------------------------------------------
  // Build mode
  // ---------------------------------------------------------------------------
  async function onBuildDrop(from: string, to: string): Promise<boolean> {
    const c = new Chess(fen);
    let moved;
    try { moved = c.move({ from, to, promotion: 'q' }); }
    catch { return false; }
    if (!moved) return false;

    const newFen = c.fen();

    // Was it the player's turn?
    const wasPlayerTurn = (moved.color === 'w') === (color === 'white');
    if (wasPlayerTurn) {
      try {
        const saved = await addRepertoireMove({
          fen: normFen(fen),
          move: moved.from + moved.to + (moved.promotion ?? ''),
          san: moved.san,
          color,
          notes: '',
        });
        setMoves(prev => {
          const filtered = prev.filter(m => normFen(m.fen) !== normFen(saved.fen));
          return [...filtered, saved];
        });
      } catch (e) { console.error('Failed to save move', e); }
    }

    setHistory(prev => [...prev, moved.san]);
    setChess(new Chess(newFen));
    setFen(newFen);
    return true;
  }

  async function handleDelete(fenBefore: string) {
    const mv = moves.find(m => normFen(m.fen) === normFen(fenBefore));
    if (!mv) return;
    try {
      await deleteRepertoireMove(mv.fen, color);
      setMoves(prev => prev.filter(m => m.id !== mv.id));
    } catch (e) { console.error('Failed to delete', e); }
  }

  // ---------------------------------------------------------------------------
  // Drill mode
  // ---------------------------------------------------------------------------
  function startDrill() {
    setMode('drill');
    setDrillScore({ correct: 0, total: 0 });
    setDrillResult(null);
    setDrillExpected(null);
    const startChess = new Chess();
    setChess(startChess);
    setFen(STARTING_FEN);
    setHistory([]);
    if (color === 'black') {
      setTimeout(() => playOpponentMove(startChess), 400);
    }
  }

  function playOpponentMove(c: Chess) {
    // Only play moves that lead to positions we have prep for (stays in tree)
    const legal = c.moves({ verbose: true });
    const inTree = legal.filter(lm => {
      const copy = new Chess(c.fen());
      copy.move(lm);
      return prepMap.has(normFen(copy.fen()));
    });
    const pool = inTree.length > 0 ? inTree : legal;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const copy = new Chess(c.fen());
    copy.move(pick);
    const newFen = copy.fen();
    setChess(new Chess(newFen));
    setFen(newFen);
    setHistory(prev => [...prev, pick.san]);
  }

  async function onDrillDrop(from: string, to: string): Promise<boolean> {
    // Only player's turn
    const isPlayerTurn = (chess.turn() === 'w') === (color === 'white');
    if (!isPlayerTurn) return false;

    // Capture prep BEFORE making the move
    const currentFenNorm = normFen(fen);
    const prep = prepMap.get(currentFenNorm);
    const preFen = fen; // save for potential revert

    const c = new Chess(fen);
    let moved;
    try { moved = c.move({ from, to, promotion: 'q' }); }
    catch { return false; }
    if (!moved) return false;

    const playedUci = moved.from + moved.to + (moved.promotion ?? '');
    setDrillScore(prev => ({ ...prev, total: prev.total + 1 }));

    if (prep && prep.move === playedUci) {
      // Correct
      const newFen = c.fen();
      setDrillResult('correct');
      setDrillScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      setHistory(prev => [...prev, moved.san]);
      setChess(new Chess(newFen));
      setFen(newFen);
      setTimeout(() => {
        setDrillResult(null);
        const next = new Chess(newFen);
        if (!next.isGameOver()) playOpponentMove(next);
      }, 700);
    } else {
      // Wrong — show correct answer and REVERT to pre-move position
      setDrillResult('wrong');
      setDrillExpected(prep?.san ?? null);
      setDrillPreFen(preFen);
      // Revert board
      setChess(new Chess(preFen));
      setFen(preFen);
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Import
  // ---------------------------------------------------------------------------
  async function handleImport() {
    setImporting(true);
    try { setCandidates(await importFromGames(color)); }
    catch (e) { console.error('Import failed', e); }
    finally { setImporting(false); }
  }

  async function addCandidate(c: ImportCandidate) {
    try {
      const saved = await addRepertoireMove({ fen: c.fen, move: c.move, san: c.san, color, notes: '' });
      setMoves(prev => {
        const filtered = prev.filter(m => normFen(m.fen) !== normFen(saved.fen));
        return [...filtered, saved];
      });
      setCandidates(prev => prev.filter(x => x.fen !== c.fen));
    } catch (e) { console.error('Failed to add candidate', e); }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const dropHandler = mode === 'drill' ? onDrillDrop : onBuildDrop;

  return (
    <div className="flex flex-col h-full bg-[#111] text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
        <button onClick={onBack} className="text-sm text-white/40 hover:text-white transition-colors">
          ← Back
        </button>
        <h2 className="text-sm font-semibold tracking-wide text-white/80">Opening Repertoire</h2>
        <div className="w-20" /> {/* spacer */}
      </div>

      {/* ── White / Black tabs ── */}
      <div className="flex border-b border-white/10 shrink-0">
        {(['white', 'black'] as const).map(c => (
          <button
            key={c}
            onClick={() => { setColor(c); setMode('build'); }}
            className={`flex-1 py-2.5 text-xs font-semibold tracking-wide uppercase transition-colors ${
              color === c
                ? 'text-white border-b-2 border-white -mb-px'
                : 'text-white/30 hover:text-white/60'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Board column */}
        <div className="flex flex-col items-center justify-center gap-3 p-5 flex-[5] border-r border-white/10">
          <div className="w-full max-w-[520px] aspect-square">
            <Chessboard
              options={{
                position: fen,
                boardOrientation: color,
                onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null; [k: string]: unknown }) => {
                  if (!targetSquare) return false;
                  void dropHandler(sourceSquare, targetSquare);
                  return true;
                },
                darkSquareStyle:  { backgroundColor: '#769656' },
                lightSquareStyle: { backgroundColor: '#eeeed2' },
                boardStyle: { borderRadius: '4px' },
                allowDragging: true,
                animationDurationInMs: 150,
              }}
            />
          </div>

          {/* Feedback */}
          {mode === 'drill' && drillResult && (
            <div className={`w-full max-w-[520px] text-center text-sm font-semibold py-2 rounded ${
              drillResult === 'correct'
                ? 'bg-green-600/20 text-green-400'
                : 'bg-red-600/20 text-red-400'
            }`}>
              {drillResult === 'correct'
                ? '✓ Correct!'
                : drillExpected
                  ? `✗ Wrong — prep is ${drillExpected}`
                  : '✗ No prep saved here'}
            </div>
          )}

          {/* Build mode: show prep at current position */}
          {mode === 'build' && prepAtCurrent && (
            <div className="w-full max-w-[520px] text-center text-xs text-[#5c8fff]/80 bg-[#5c8fff]/10 rounded py-1.5">
              Prep here: <span className="font-bold text-[#5c8fff]">{prepAtCurrent.san}</span>
            </div>
          )}

          {/* Move history */}
          {history.length > 0 && (
            <p className="text-xs text-white/30 text-center max-w-[520px] leading-relaxed">
              {history.map((san, i) => {
                const isWhiteMove = i % 2 === 0;
                const moveNum = Math.floor(i / 2) + 1;
                return (isWhiteMove ? `${moveNum}. ` : '') + san + ' ';
              }).join('')}
            </p>
          )}

          {/* Controls */}
          <div className="flex gap-2 w-full max-w-[520px]">
            <button
              onClick={resetBoard}
              className="flex-1 py-1.5 rounded bg-white/8 hover:bg-white/15 text-xs text-white/60 transition-colors"
            >
              Reset
            </button>
            {mode === 'build' ? (
              <button
                onClick={startDrill}
                disabled={moves.length === 0}
                className="flex-1 py-1.5 rounded bg-[#5c8fff]/80 hover:bg-[#5c8fff] text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Dumbbell size={12} /> Drill
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setMode('build'); resetBoard(); }}
                  className="flex-1 py-1.5 rounded bg-white/8 hover:bg-white/15 text-xs text-white/60 transition-colors flex items-center justify-center gap-1"
                >
                  <BookOpen size={12} /> Build
                </button>
                <span className="flex items-center text-xs text-white/40 shrink-0">
                  {drillScore.correct}/{drillScore.total}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Tree column */}
        <div className="flex flex-col flex-[3] overflow-hidden min-w-0">

          {/* Tree header */}
          <div className="px-4 py-2 border-b border-white/5 shrink-0">
            <span className="text-[10px] text-white/25 uppercase tracking-widest">
              {color === 'white' ? 'White' : 'Black'} repertoire · {moves.length} moves
            </span>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {tree.length === 0 ? (
              <p className="text-xs text-white/25 text-center py-8 leading-relaxed">
                Play your moves on the board<br />to build your prep tree
              </p>
            ) : (
              <TreeView
                nodes={tree}
                onNavigate={navigateTo}
                activeFen={fen}
                onDelete={handleDelete}
                playerColor={color}
              />
            )}
          </div>

          {/* Import */}
          <div className="border-t border-white/10 px-4 py-3 shrink-0">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 text-xs text-white/35 hover:text-white/70 transition-colors disabled:opacity-40"
            >
              <Download size={12} />
              {importing ? 'Scanning…' : 'Import from saved games'}
            </button>
            {candidates.length > 0 && (
              <div className="mt-2 space-y-1 max-h-36 overflow-y-auto">
                {candidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-white/60">
                      {c.san}
                      <span className="text-white/25 ml-1">×{c.count}</span>
                    </span>
                    <button onClick={() => addCandidate(c)} className="text-[#5c8fff] hover:underline ml-2">
                      Add
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
