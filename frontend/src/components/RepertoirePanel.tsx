'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Chess } from 'chess.js';
import { Trash2, Download, Dumbbell, BookOpen, Settings } from 'lucide-react';
import {
  getRepertoire,
  addRepertoireMove,
  deleteRepertoireMove,
  importFromGames,
  type ImportCandidate,
} from '@/lib/library';
import type { RepertoireMove, TopLine } from '@/types';
import { EngineLines } from '@/components/EngineLines';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

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
  moveUci: string;     // UCI of this move (needed for delete)
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
  movesMap: Map<string, RepertoireMove[]>,
  depth = 0,
): TreeNode[] {
  if (depth > 30) return [];

  const movesFromHere = movesMap.get(normFen(fen)) ?? [];
  const result: TreeNode[] = [];

  for (const mv of movesFromHere) {
    const from  = mv.move.slice(0, 2);
    const to    = mv.move.slice(2, 4);
    const promo = mv.move.length > 4 ? mv.move[4] : undefined;
    try {
      const copy = new Chess(fen);
      const moved = copy.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      if (!moved) continue;
      const newFen = copy.fen();
      result.push({
        san: mv.san,
        fen: newFen,
        fenBefore: fen,
        moveUci: mv.move,
        isPlayer: mv.isPlayerMove,
        moveNum: copy.moveNumber(),
        children: buildTree(newFen, movesMap, depth + 1),
      });
    } catch { continue; }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Tree renderer — inline chains, branches indented
// ---------------------------------------------------------------------------

/** Returns the move-number prefix to show before a move in the inline chain. */
function getMovePrefix(fenBefore: string, moveNum: number, i: number): string | null {
  const isWhite = fenBefore.split(' ')[1] === 'w';
  if (i === 0) return isWhite ? `${moveNum}.` : `${moveNum - 1}…`;
  if (isWhite) return `${moveNum}.`; // white always shows number (follows black's move)
  return null; // black after white: number implied inline
}

function LineView({
  startNode,
  playerColor,
  onNavigate,
  activeFen,
  onDelete,
  openingCache,
  isSubLine = false,
}: {
  startNode: TreeNode;
  playerColor: 'white' | 'black';
  onNavigate: (fen: string) => void;
  activeFen: string;
  onDelete: (fenBefore: string, moveUci: string) => void;
  openingCache: Map<string, string>;
  isSubLine?: boolean;
}) {
  // Collect the linear chain: keep going while there's exactly one child.
  const chain: TreeNode[] = [];
  let cur: TreeNode | null = startNode;
  while (cur) {
    chain.push(cur);
    cur = cur.children.length === 1 ? cur.children[0] : null;
  }
  const lastNode = chain[chain.length - 1];
  const branches = lastNode.children; // 0 (leaf) or 2+ (branch point)
  const lineName = openingCache.get(normFen(lastNode.fen));

  return (
    <div className={isSubLine ? 'ml-3 border-l border-white/10 pl-2 mt-0.5' : 'mt-0.5'}>
      {/* Inline move sequence */}
      <div className="flex flex-wrap items-center gap-x-0.5 gap-y-0.5 py-0.5">
        {isSubLine && <span className="text-white/20 text-xs mr-0.5 shrink-0">↳</span>}
        {chain.map((node, i) => {
          const prefix = getMovePrefix(node.fenBefore, node.moveNum, i);
          const isActive = normFen(node.fen) === normFen(activeFen);
          return (
            <span key={i} className="flex items-center gap-0.5">
              {prefix && (
                <span className="text-white/30 text-xs font-mono shrink-0">{prefix}</span>
              )}
              <span className="relative group/move inline-flex">
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
                {node.isPlayer && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(node.fenBefore, node.moveUci); }}
                    className="absolute -top-1 -right-1 opacity-0 group-hover/move:opacity-100 text-white/20 hover:text-red-400 transition-all"
                  >
                    <Trash2 size={9} />
                  </button>
                )}
              </span>
            </span>
          );
        })}
        {/* Opening name at end of chain */}
        {lineName && (
          <span className="text-[10px] text-white/25 font-sans ml-1 shrink-0 italic truncate max-w-[120px]" title={lineName}>
            {lineName}
          </span>
        )}
      </div>
      {/* Branch alternatives */}
      {branches.map((child, i) => (
        <LineView
          key={i}
          startNode={child}
          playerColor={playerColor}
          onNavigate={onNavigate}
          activeFen={activeFen}
          onDelete={onDelete}
          openingCache={openingCache}
          isSubLine
        />
      ))}
    </div>
  );
}

function TreeView({
  nodes,
  onNavigate,
  activeFen,
  onDelete,
  playerColor,
  openingCache,
}: {
  nodes: TreeNode[];
  onNavigate: (fen: string) => void;
  activeFen: string;
  onDelete: (fenBefore: string, moveUci: string) => void;
  playerColor: 'white' | 'black';
  openingCache: Map<string, string>;
}) {
  if (nodes.length === 0) return null;
  return (
    <div>
      {nodes.map((node, i) => (
        <LineView
          key={i}
          startNode={node}
          playerColor={playerColor}
          onNavigate={onNavigate}
          activeFen={activeFen}
          onDelete={onDelete}
          openingCache={openingCache}
        />
      ))}
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
  const [drillExpected, setDrillExpected]     = useState<string | null>(null);
  const [drillPreFen, setDrillPreFen]         = useState<string | null>(null);

  // Engine + opening state
  const [deepLines, setDeepLines] = useState<TopLine[]>([]);
  const [deepDepth, setDeepDepth] = useState<number | null>(null);
  const [lineCount, setLineCount] = useState<1 | 3>(1);
  const [opening, setOpening]     = useState<{ name: string; eco: string } | null>(null);
  const [openingCache, setOpeningCache] = useState<Map<string, string>>(new Map());
  const fenRef         = useRef<string>('');
  const movesMapRef    = useRef<Map<string, RepertoireMove[]>>(new Map());
  const fetchedFensRef = useRef(new Set<string>());

  // Fenhistory for arrow-key navigation
  const [fenHistory, setFenHistory] = useState<string[]>([STARTING_FEN]);

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

  // Progressive deepening — runs in build mode whenever the board position changes
  useEffect(() => {
    if (mode !== 'build') return;
    fenRef.current = fen;
    setDeepLines([]);
    setDeepDepth(null);
    let cancelled = false;
    (async () => {
      for (const depth of [8, 10, 12, 14, 16, 18]) {
        if (cancelled || fenRef.current !== fen) break;
        try {
          const res = await fetch(`${API}/api/analysis/eval`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, depth }),
          });
          if (cancelled || fenRef.current !== fen) break;
          const data: { eval: number; top_lines: TopLine[]; depth: number } = await res.json();
          if (cancelled || fenRef.current !== fen) break;
          setDeepLines(data.top_lines);
          setDeepDepth(data.depth);
        } catch { break; }
      }
    })();
    return () => { cancelled = true; };
  }, [fen, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening detection (current board position)
  useEffect(() => {
    if (fen === STARTING_FEN) { setOpening(null); return; }
    let cancelled = false;
    fetch(`${API}/api/analysis/opening`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }),
    })
      .then(r => r.json())
      .then(d => { if (!cancelled && d?.name) setOpening({ name: d.name, eco: d.eco ?? '' }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fen]);

  // Arrow-key navigation
  const goBack = useCallback(() => {
    setFenHistory(prev => {
      if (prev.length <= 1) return prev;
      const next = prev.slice(0, -1);
      const prevFen = next[next.length - 1];
      setChess(new Chess(prevFen));
      setFen(prevFen);
      setDrillResult(null);
      setHistory(h => h.slice(0, -1));
      return next;
    });
  }, []);

  const goForward = useCallback(() => {
    const nextMoves = movesMapRef.current.get(normFen(fenRef.current)) ?? [];
    if (nextMoves.length === 0) return;
    const mv = nextMoves[0];
    const from = mv.move.slice(0, 2);
    const to   = mv.move.slice(2, 4);
    const promo = mv.move.length > 4 ? mv.move[4] : undefined;
    try {
      const c = new Chess(fenRef.current);
      const moved = c.move({ from, to, ...(promo ? { promotion: promo } : {}) });
      if (!moved) return;
      const newFen = c.fen();
      setFenHistory(prev => [...prev, newFen]);
      setHistory(prev => [...prev, moved.san]);
      setChess(new Chess(newFen));
      setFen(newFen);
    } catch {}
  }, []);

  useEffect(() => {
    if (mode !== 'build') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); goBack(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goForward(); }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, goBack, goForward]);

  // ---------------------------------------------------------------------------
  // Moves map & prep map (memoised)
  // ---------------------------------------------------------------------------
  // movesMap: normFen → all saved moves from that position (player + opponent)
  const movesMap = useMemo(() => {
    const m = new Map<string, RepertoireMove[]>();
    moves.forEach(mv => {
      const key = normFen(mv.fen);
      const arr = m.get(key) ?? [];
      arr.push(mv);
      m.set(key, arr);
    });
    return m;
  }, [moves]);

  // prepMap: normFen → player move only (for drill / build feedback)
  const prepMap = useMemo(() => {
    const m = new Map<string, { san: string; move: string }>();
    moves.filter(mv => mv.isPlayerMove).forEach(mv => m.set(normFen(mv.fen), { san: mv.san, move: mv.move }));
    return m;
  }, [moves]);

  movesMapRef.current = movesMap;

  const tree = useMemo(
    () => buildTree(STARTING_FEN, movesMap),
    [movesMap],
  );

  const prepAtCurrent = prepMap.get(normFen(fen)) ?? null;

  // Pre-fetch opening names for every position in the tree
  useEffect(() => {
    const fens = new Set<string>();
    function collect(nodes: TreeNode[]) {
      nodes.forEach(n => { fens.add(n.fen); collect(n.children); });
    }
    collect(tree);
    fens.forEach(f => {
      const key = normFen(f);
      if (fetchedFensRef.current.has(key)) return;
      fetchedFensRef.current.add(key);
      fetch(`${API}/api/analysis/opening`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fen: f }),
      })
        .then(r => r.json())
        .then(d => { if (d?.name) setOpeningCache(p => new Map(p).set(key, `${d.eco ?? ''} ${d.name}`.trim())); })
        .catch(() => {});
    });
  }, [tree]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Board reset
  // ---------------------------------------------------------------------------
  function resetBoard() {
    setChess(new Chess());
    setFen(STARTING_FEN);
    setHistory([]);
    setFenHistory([STARTING_FEN]);
    setDrillResult(null);
    setDrillExpected(null);
    setDrillPreFen(null);
  }

  function navigateTo(targetFen: string) {
    setChess(new Chess(targetFen));
    setFen(targetFen);
    setFenHistory([targetFen]);
    setHistory([]);
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
    const isPlayerMove = (moved.color === 'w') === (color === 'white');
    const moveUci = moved.from + moved.to + (moved.promotion ?? '');

    try {
      const saved = await addRepertoireMove({
        fen: normFen(fen),
        move: moveUci,
        san: moved.san,
        color,
        isPlayerMove,
        notes: '',
      });
      setMoves(prev => {
        // Replace any existing entry with the same fen+move combo
        const filtered = prev.filter(m => !(normFen(m.fen) === normFen(saved.fen) && m.move === saved.move));
        return [...filtered, saved];
      });
    } catch (e) { console.error('Failed to save move', e); }

    setFenHistory(prev => [...prev, newFen]);
    setHistory(prev => [...prev, moved.san]);
    setChess(new Chess(newFen));
    setFen(newFen);
    return true;
  }

  async function handleDelete(fenBefore: string, moveUci: string) {
    const mv = moves.find(m => normFen(m.fen) === normFen(fenBefore) && m.move === moveUci);
    if (!mv) return;
    try {
      await deleteRepertoireMove(mv.fen, mv.move, color);
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
    // Prefer saved opponent moves from this position
    const savedOpponent = (movesMap.get(normFen(c.fen())) ?? []).filter(mv => !mv.isPlayerMove);
    if (savedOpponent.length > 0) {
      const pick = savedOpponent[Math.floor(Math.random() * savedOpponent.length)];
      const from  = pick.move.slice(0, 2);
      const to    = pick.move.slice(2, 4);
      const promo = pick.move.length > 4 ? pick.move[4] : undefined;
      try {
        const copy = new Chess(c.fen());
        copy.move({ from, to, ...(promo ? { promotion: promo } : {}) });
        const newFen = copy.fen();
        setChess(new Chess(newFen));
        setFen(newFen);
        setHistory(prev => [...prev, pick.san]);
        return;
      } catch { /* fall through to legal-move fallback */ }
    }
    // Fallback: pick a legal move that leads to a position with prep
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
      const saved = await addRepertoireMove({ fen: c.fen, move: c.move, san: c.san, color, isPlayerMove: true, notes: '' });
      setMoves(prev => {
        const filtered = prev.filter(m => !(normFen(m.fen) === normFen(saved.fen) && m.move === saved.move));
        return [...filtered, saved];
      });
      setCandidates(prev => prev.filter(x => !(x.fen === c.fen && x.move === c.move)));
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
        <div className="flex flex-col items-center justify-center gap-3 p-6 flex-[6] border-r border-white/10">
          <div className="w-full max-w-[620px] aspect-square">
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
                darkSquareNotationStyle:  { color: '#eeeed2', fontWeight: '700', fontSize: '11px' },
                lightSquareNotationStyle: { color: '#769656', fontWeight: '700', fontSize: '11px' },
                boardStyle: { borderRadius: '4px' },
                allowDragging: true,
                animationDurationInMs: 150,
              }}
            />
          </div>

          {/* Feedback */}
          {mode === 'drill' && drillResult && (
            <div className={`w-full max-w-[620px] text-center text-sm font-semibold py-2.5 rounded ${
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
            <div className="w-full max-w-[620px] text-center text-xs text-[#5c8fff]/80 bg-[#5c8fff]/10 rounded py-1.5">
              Prep here: <span className="font-bold text-[#5c8fff]">{prepAtCurrent.san}</span>
            </div>
          )}

          {/* Move history */}
          {history.length > 0 && (
            <p className="text-xs text-white/30 text-center max-w-[620px] leading-relaxed">
              {history.map((san, i) => {
                const isWhiteMove = i % 2 === 0;
                const moveNum = Math.floor(i / 2) + 1;
                return (isWhiteMove ? `${moveNum}. ` : '') + san + ' ';
              }).join('')}
            </p>
          )}

          {/* Controls */}
          <div className="flex gap-2 w-full max-w-[620px]">
            <button
              onClick={resetBoard}
              className="flex-1 py-2.5 rounded bg-white/8 hover:bg-white/15 text-sm text-white/60 transition-colors"
            >
              Reset
            </button>
            {mode === 'build' ? (
              <button
                onClick={startDrill}
                disabled={moves.length === 0}
                className="flex-1 py-2.5 rounded bg-[#5c8fff]/80 hover:bg-[#5c8fff] text-sm font-semibold text-white transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Dumbbell size={14} /> Drill
              </button>
            ) : (
              <>
                <button
                  onClick={() => { setMode('build'); resetBoard(); }}
                  className="flex-1 py-2.5 rounded bg-white/8 hover:bg-white/15 text-sm text-white/60 transition-colors flex items-center justify-center gap-1.5"
                >
                  <BookOpen size={14} /> Build
                </button>
                <span className="flex items-center text-sm text-white/40 shrink-0 font-mono">
                  {drillScore.correct}/{drillScore.total}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right column: engine + opening + tree */}
        <div className="flex flex-col flex-[3] overflow-hidden min-w-0">

          {/* Engine lines (build mode only) */}
          {mode === 'build' && (
            <div className="border-b border-white/5 shrink-0">
              <div className="flex items-center justify-end px-3 pt-2">
                <button
                  onClick={() => setLineCount(n => n === 1 ? 3 : 1)}
                  title={lineCount === 1 ? 'Show 3 lines' : 'Show 1 line'}
                  className="text-white/20 hover:text-white/60 transition-colors flex items-center gap-1 text-[10px]"
                >
                  <Settings size={11} />
                  <span className="font-mono">{lineCount}</span>
                </button>
              </div>
              <div className="px-3 pb-2">
                <EngineLines
                  lines={deepLines.slice(0, lineCount)}
                  isWhiteToMove={chess.turn() === 'w'}
                  depth={deepDepth ?? undefined}
                />
              </div>
            </div>
          )}

          {/* Opening name */}
          {opening && (
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
              <p className="text-xs text-white/50 truncate">
                <span className="text-white/25 font-mono mr-1.5">{opening.eco}</span>
                {opening.name}
              </p>
            </div>
          )}

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
                openingCache={openingCache}
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
