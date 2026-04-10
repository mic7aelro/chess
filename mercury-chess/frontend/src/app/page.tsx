'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Chess } from 'chess.js';
import { MoveList } from '@/components/MoveList';
import { EvalGraph } from '@/components/EvalGraph';
import { AccuracyCards } from '@/components/AccuracyCards';
import { BoardPanel } from '@/components/BoardPanel';
import { EngineLines } from '@/components/EngineLines';
import type { AnalysisResult, Classification, TopLine } from '@/types';

// ---------------------------------------------------------------------------
// Win-probability classification
// ---------------------------------------------------------------------------
function cpToWinProb(cp: number): number {
  if (cp >= 10000) return 1;
  if (cp <= -10000) return 0;
  return 1 / (1 + Math.pow(10, -cp / 400));
}

function classifyMove(scoreBefore: number, scoreAfter: number): Classification {
  const loss = Math.max(0, cpToWinProb(scoreBefore) - cpToWinProb(scoreAfter));
  if (loss < 0.005) return 'best';
  if (loss < 0.02)  return 'excellent';
  if (loss < 0.05)  return 'good';
  if (loss < 0.10)  return 'inaccuracy';
  if (loss < 0.20)  return 'mistake';
  return 'blunder';
}

// Chess.com-accurate classification colours
const CLS_LABEL: Record<Classification, {
  symbol: string; label: string;
  textClass: string;   // for inline text
  badgeBg: string;     // for circular badge background (CSS hex)
  badgeText: string;   // badge text colour
}> = {
  book:       { symbol: '⊕',  label: 'Book',       textClass: 'text-zinc-500',  badgeBg: '#4b5563', badgeText: '#fff' },
  brilliant:  { symbol: '!!', label: 'Brilliant',  textClass: 'text-[#1fada8]', badgeBg: '#1fada8', badgeText: '#fff' },
  great:      { symbol: '!',  label: 'Great',      textClass: 'text-[#5c8fff]', badgeBg: '#5c8fff', badgeText: '#fff' },
  best:       { symbol: '★',  label: 'Best',       textClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  excellent:  { symbol: '✓',  label: 'Excellent',  textClass: 'text-[#96bc4b]', badgeBg: '#96bc4b', badgeText: '#fff' },
  good:       { symbol: '',   label: 'Good',       textClass: 'text-zinc-400',  badgeBg: '#6b7280', badgeText: '#fff' },
  inaccuracy: { symbol: '?!', label: 'Inaccuracy', textClass: 'text-[#f4bf00]', badgeBg: '#f4bf00', badgeText: '#000' },
  mistake:    { symbol: '?',  label: 'Mistake',    textClass: 'text-[#e07b2a]', badgeBg: '#e07b2a', badgeText: '#fff' },
  miss:       { symbol: '⊘',  label: 'Miss',       textClass: 'text-[#e05c2a]', badgeBg: '#e05c2a', badgeText: '#fff' },
  blunder:    { symbol: '??', label: 'Blunder',    textClass: 'text-[#ca3431]', badgeBg: '#ca3431', badgeText: '#fff' },
};

function useBoardSize() {
  const [size, setSize] = useState(600);
  useEffect(() => {
    function calc() {
      // Left column is 75vw; subtract eval-bar (16px) + gaps/padding (64px)
      const fromWidth = window.innerWidth * 0.75 - 80;
      // Leave room for title, controls, engine lines (~160px)
      const fromHeight = window.innerHeight - 160;
      setSize(Math.floor(Math.min(fromWidth, fromHeight)));
    }
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  return size;
}

// ---------------------------------------------------------------------------
// Explore state
// ---------------------------------------------------------------------------
interface ExploreFrame {
  fen: string;
  from_sq: string;
  to_sq: string;
  evalCp: number;
  lines: TopLine[];
  san: string;
}

// ---------------------------------------------------------------------------
// Right-panel states
// ---------------------------------------------------------------------------
type PanelState = 'menu' | 'paste' | 'analysis' | 'freeplay';

export default function Home() {
  const [result, setResult]           = useState<AnalysisResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [selectedPly, setSelectedPly] = useState<number | null>(null);
  const [flipped, setFlipped]         = useState(false);
  const [panelState, setPanelState]   = useState<PanelState>('menu');
  const [pgn, setPgn]                 = useState('');

  const [exploreStack, setExploreStack] = useState<ExploreFrame[]>([]);
  const [exploreFrame, setExploreFrame] = useState<ExploreFrame | null>(null);
  const isExploring = exploreFrame !== null;

  const boardSize = useBoardSize();

  // Progressive deepening — lines that update as Stockfish searches deeper
  const [deepLines, setDeepLines] = useState<TopLine[]>([]);
  const deepFenRef = useRef<string>('');

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------
  async function handleAnalyse() {
    if (!pgn.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPly(null);
    setExploreFrame(null);
    setExploreStack([]);
    try {
      const res = await fetch('http://localhost:8000/api/analysis/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn: pgn.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? 'Analysis failed');
      }
      const data = await res.json();
      setResult(data);
      setPanelState('analysis');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derive display state
  // ---------------------------------------------------------------------------
  const gameMoveAtPly = result && selectedPly !== null
    ? result.moves.find((m) => m.ply === selectedPly) ?? null
    : null;

  const gameFen       = gameMoveAtPly?.fen ?? result?.starting_fen ?? 'start';
  const gameEval      = gameMoveAtPly?.eval ?? 0;
  const gameLines     = gameMoveAtPly?.top_lines ?? result?.initial_lines ?? [];
  const gameLastMove  = gameMoveAtPly
    ? { from: gameMoveAtPly.from_sq, to: gameMoveAtPly.to_sq }
    : null;
  const gameIsWhiteToMove = (selectedPly ?? 0) % 2 === 0;

  const displayFen         = isExploring ? exploreFrame!.fen    : gameFen;
  const displayEval        = isExploring ? exploreFrame!.evalCp : gameEval;
  const displayLines       = deepLines.length > 0 ? deepLines : (isExploring ? exploreFrame!.lines : gameLines);
  const displayLastMove    = isExploring
    ? { from: exploreFrame!.from_sq, to: exploreFrame!.to_sq }
    : gameLastMove;
  const displayIsWhiteToMove = isExploring
    ? new Chess(exploreFrame!.fen === 'start' ? undefined : exploreFrame!.fen).turn() === 'w'
    : gameIsWhiteToMove;

  // ---------------------------------------------------------------------------
  // Navigation helpers
  // ---------------------------------------------------------------------------
  function navFirst() {
    exitExplore();
    setSelectedPly(null);
  }

  function navBack() {
    if (isExploring) {
      handleExploreBack();
    } else if (result) {
      setSelectedPly((p) => (p === null || p <= 1 ? null : p - 1));
    }
  }

  function navForward() {
    if (!isExploring && result) {
      const maxPly = result.moves[result.moves.length - 1]?.ply ?? 0;
      setSelectedPly((p) => { const n = (p ?? 0) + 1; return n > maxPly ? p : n; });
    }
  }

  function navLast() {
    if (!isExploring && result) {
      exitExplore();
      const maxPly = result.moves[result.moves.length - 1]?.ply ?? 0;
      setSelectedPly(maxPly);
    }
  }

  // ---------------------------------------------------------------------------
  // Piece drag / click-to-move
  // ---------------------------------------------------------------------------
  function handlePieceDrop(from: string, to: string): boolean {
    const baseFen = isExploring ? exploreFrame!.fen : gameFen;
    const chess   = baseFen === 'start' ? new Chess() : new Chess(baseFen);

    let moveResult: ReturnType<Chess['move']>;
    try { moveResult = chess.move({ from, to, promotion: 'q' }); }
    catch { return false; }
    if (!moveResult) return false;

    const newFen = chess.fen();
    const san    = moveResult.san;

    setExploreStack((s) => isExploring ? [...s, exploreFrame!] : []);
    setExploreFrame({ fen: newFen, from_sq: from, to_sq: to, evalCp: isExploring ? exploreFrame!.evalCp : gameEval, lines: [], san });

    // Auto-enter freeplay mode when making moves without a loaded game
    if (!result) setPanelState('freeplay');

    return true;
  }

  // ---------------------------------------------------------------------------
  // Explore navigation
  // ---------------------------------------------------------------------------
  function handleExploreBack() {
    if (exploreStack.length > 0) {
      const prev = exploreStack[exploreStack.length - 1];
      setExploreStack((s) => s.slice(0, -1));
      setExploreFrame(prev);
    } else {
      setExploreFrame(null);
      setExploreStack([]);
    }
  }

  function exitExplore() {
    setExploreFrame(null);
    setExploreStack([]);
  }

  // Build a PGN string from the current explore stack (for freeplay Review)
  function buildExploreAsPgn(): string {
    const frames = exploreFrame ? [...exploreStack, exploreFrame] : exploreStack;
    let pgn = '';
    frames.forEach((frame, i) => {
      if (i % 2 === 0) pgn += `${Math.floor(i / 2) + 1}. `;
      pgn += frame.san + ' ';
    });
    return pgn.trim();
  }

  async function handleFreeplayReview() {
    const pgn = buildExploreAsPgn();
    if (!pgn) return;
    exitExplore();
    setPgn(pgn);
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedPly(null);
    try {
      const res = await fetch('http://localhost:8000/api/analysis/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pgn }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail ?? 'Analysis failed');
      }
      const data = await res.json();
      setResult(data);
      setPanelState('analysis');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPanelState('paste');
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  navBack();
      if (e.key === 'ArrowRight') navForward();
      if (e.key === 'Escape' && isExploring) exitExplore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [result, isExploring, exploreStack, selectedPly],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ---------------------------------------------------------------------------
  // Progressive deepening — sequential so only one Stockfish process runs at a time
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const fen = displayFen === 'start'
      ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      : displayFen;

    deepFenRef.current = fen;
    setDeepLines([]);

    let cancelled = false;

    (async () => {
      for (const time of [0.3, 1, 3, 5, 10, 20, 40, 80]) {
        if (cancelled || deepFenRef.current !== fen) break;
        try {
          const res = await fetch('http://localhost:8000/api/analysis/eval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen, time }),
          });
          if (cancelled || deepFenRef.current !== fen) break;
          const data: { eval: number; top_lines: TopLine[] } = await res.json();
          if (cancelled || deepFenRef.current !== fen) break;
          setDeepLines(data.top_lines);
        } catch { break; }
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayFen]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen bg-[#0e0e0e] text-white">

      {/* ── Left column: 75% — persistent board ── */}
      <div className="sticky top-0 h-screen w-3/4 shrink-0 flex flex-col border-r border-zinc-800 relative">

        {/* Title: top-left corner above eval bar */}
        <h1 className="absolute top-4 left-5 text-xl font-bold tracking-tight z-10">Mercury Chess</h1>

        {/* Board: centred in available space */}
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col gap-2">
            <BoardPanel
              fen={displayFen}
              lastMove={displayLastMove}
              evalCp={displayEval}
              orientation={flipped ? 'black' : 'white'}
              onPieceDrop={handlePieceDrop}
              size={boardSize}
            />

            {/* Controls row below board */}
            <div className="flex items-center justify-end gap-3">
              {isExploring && (
                <button
                  onClick={exitExplore}
                  className="text-xs text-zinc-500 hover:text-zinc-200 border border-zinc-700 rounded-full px-3 py-0.5 transition-colors cursor-pointer"
                >
                  ✕ exit explore
                </button>
              )}
              <button
                onClick={() => setFlipped((f) => !f)}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                ⇅ flip board
              </button>
            </div>
          </div>
        </div>

        <p className="absolute bottom-3 left-5 text-xs text-zinc-700">
          ← → step · drag/click to explore · Esc exit
        </p>
      </div>

      {/* ── Right column: 25% — 3-state panel ── */}
      <div className="w-1/4 flex flex-col h-screen overflow-y-auto border-l border-zinc-800">

        {/* ── Tabbed info panel — always at the top ── */}
        {/* ── Engine analysis ── */}
        <div className="shrink-0 border-b border-zinc-800 px-3 py-3">
          {displayLines.length > 0
            ? <EngineLines lines={displayLines} isWhiteToMove={displayIsWhiteToMove} />
            : <p className="text-xs text-zinc-600 py-2 text-center">Analysing position…</p>
          }
        </div>

        {/* ── STATE: menu ── */}
        {panelState === 'menu' && (
          <div className="flex flex-col gap-1 py-6 px-4 w-full mt-16">
            <button
              onClick={() => setPanelState('paste')}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-zinc-800/60 transition-colors cursor-pointer text-left"
            >
              <span className="text-zinc-400 text-lg">⊞</span>
              <div>
                <p className="text-sm font-medium text-zinc-200">Paste FEN / PGN</p>
                <p className="text-xs text-zinc-600">Analyse a game or position</p>
              </div>
            </button>
            <button
              disabled
              className="flex items-center gap-3 px-4 py-3 rounded-lg opacity-30 cursor-not-allowed text-left"
            >
              <span className="text-zinc-400 text-lg">⊕</span>
              <div>
                <p className="text-sm font-medium text-zinc-200">Add Games</p>
                <p className="text-xs text-zinc-600">Coming soon</p>
              </div>
            </button>
          </div>
        )}

        {/* ── STATE: freeplay ── */}
        {panelState === 'freeplay' && (
          <div className="flex flex-col h-screen">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
              <span className="text-xs text-zinc-400 font-semibold uppercase tracking-widest">Free Play</span>
              <div className="flex items-center gap-1">
                <NavBtn onClick={navBack}  title="Previous">◀</NavBtn>
                <NavBtn onClick={() => {
                  if (isExploring) {
                    const frames = [...exploreStack, exploreFrame!];
                    const next = frames[frames.length - 2];
                    if (next) { setExploreStack(s => s.slice(0, -1)); setExploreFrame(next); }
                  }
                }} title="Next">▶</NavBtn>
              </div>
            </div>

            {/* Move list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <FreeplayMoveList
                frames={exploreFrame ? [...exploreStack, exploreFrame] : exploreStack}
                currentIdx={exploreFrame ? [...exploreStack, exploreFrame].length - 1 : -1}
              />
            </div>

            {/* Action buttons */}
            <div className="shrink-0 border-t border-zinc-800 p-3 flex gap-2">
              <button
                onClick={() => { exitExplore(); setPanelState('menu'); }}
                className="flex-1 py-2 text-xs text-zinc-400 border border-zinc-700 rounded hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                New
              </button>
              <button
                onClick={handleFreeplayReview}
                disabled={loading || (!exploreFrame && exploreStack.length === 0)}
                className="flex-1 py-2 text-xs font-semibold bg-white text-black rounded hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? 'Analysing…' : 'Review'}
              </button>
            </div>
          </div>
        )}

        {/* ── STATE: paste ── */}
        {panelState === 'paste' && (
          <div className="flex flex-col gap-4 p-4 w-full">
            {/* Back header */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setPanelState('menu'); setError(null); }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-lg leading-none"
              >
                ←
              </button>
              <h2 className="text-sm font-semibold text-zinc-300">Paste FEN / PGN</h2>
            </div>

            <textarea
              className="w-full h-52 bg-[#1a1a1a] border border-zinc-700 rounded-lg p-4 text-sm font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-400 resize-none"
              placeholder="Paste PGN or FEN here…"
              value={pgn}
              onChange={(e) => setPgn(e.target.value)}
              autoFocus
            />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              className="self-start px-6 py-2 bg-white text-black text-sm font-semibold rounded-full hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              onClick={handleAnalyse}
              disabled={loading || !pgn.trim()}
              suppressHydrationWarning
            >
              {loading ? 'Analysing…' : 'Analyse'}
            </button>
          </div>
        )}

        {/* ── STATE: analysis ── */}
        {panelState === 'analysis' && result && (
          <div className="flex flex-col min-h-full">

            {/* Nav bar */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-zinc-800 shrink-0">
              {/* Back to menu */}
              <button
                onClick={() => { setPanelState('menu'); exitExplore(); }}
                className="text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-sm"
              >
                ← Menu
              </button>

              {/* Step controls */}
              <div className="flex items-center gap-1">
                <NavBtn onClick={navFirst} title="First move">⏮</NavBtn>
                <NavBtn onClick={navBack}  title="Previous">◀</NavBtn>
                <NavBtn onClick={navForward} title="Next">▶</NavBtn>
                <NavBtn onClick={navLast}  title="Last move">⏭</NavBtn>
              </div>
            </div>

            {/* Opening name */}
            {result.opening && (
              <div className="px-6 py-2 border-b border-zinc-800/60 shrink-0">
                <p className="text-xs text-zinc-500">
                  {result.opening.eco && (
                    <span className="text-zinc-400 font-mono mr-1.5">{result.opening.eco}</span>
                  )}
                  {result.opening.name}
                </p>
              </div>
            )}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              <div className="py-4 px-4 flex flex-col gap-5">

                <EvalGraph
                  moves={result.moves}
                  selectedPly={selectedPly}
                  onSelectPly={(ply) => { exitExplore(); setSelectedPly(ply); }}
                />

                {result.white && result.black && (
                  <AccuracyCards
                    whiteName={result.headers.White ?? 'White'}
                    blackName={result.headers.Black ?? 'Black'}
                    white={result.white}
                    black={result.black}
                    moves={result.moves}
                  />
                )}

                <MoveList
                  result={result}
                  selectedPly={isExploring ? null : selectedPly}
                  onSelectPly={(ply) => { exitExplore(); setSelectedPly(ply); }}
                  exploreMoves={isExploring
                    ? [...exploreStack, exploreFrame!].map(f => ({
                        san: f.san,
                        classification: null,
                      }))
                    : undefined}
                  branchPly={isExploring ? selectedPly : undefined}
                />

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function NavBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-9 h-9 flex items-center justify-center rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer text-sm"
    >
      {children}
    </button>
  );
}

function FreeplayMoveList({
  frames, currentIdx,
}: { frames: ExploreFrame[]; currentIdx: number }) {
  if (frames.length === 0) {
    return <p className="text-xs text-zinc-600 text-center mt-8">Make a move to begin</p>;
  }

  const pairs: Array<{ num: number; white: ExploreFrame; black?: ExploreFrame }> = [];
  for (let i = 0; i < frames.length; i += 2) {
    pairs.push({ num: Math.floor(i / 2) + 1, white: frames[i], black: frames[i + 1] });
  }

  return (
    <div className="divide-y divide-zinc-800/50">
      {pairs.map(({ num, white, black }) => (
        <div key={num} className="grid grid-cols-[2rem_1fr_1fr] gap-x-2 py-1 text-sm">
          <span className="text-zinc-600 text-xs self-start pt-1">{num}</span>
          <FreeplayMove frame={white} active={frames.indexOf(white) === currentIdx} />
          {black
            ? <FreeplayMove frame={black} active={frames.indexOf(black) === currentIdx} />
            : <span />}
        </div>
      ))}
    </div>
  );
}

function FreeplayMove({ frame, active }: { frame: ExploreFrame; active: boolean }) {
  return (
    <span className={`font-mono text-sm px-1 rounded ${active ? 'bg-zinc-700/60 text-zinc-100' : 'text-zinc-300'}`}>
      {frame.san}
    </span>
  );
}

// Classification summary bar — compact per-player counts with Chess.com-style badges
const CLS_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good',
  'inaccuracy', 'mistake', 'miss', 'blunder',
];

import type { MoveEval } from '@/types';

function ClassificationSummary({ moves }: { moves: MoveEval[] }) {
  const whiteCounts: Partial<Record<Classification, number>> = {};
  const blackCounts: Partial<Record<Classification, number>> = {};

  for (const m of moves) {
    const isWhite = m.ply % 2 === 1;
    const bucket = isWhite ? whiteCounts : blackCounts;
    bucket[m.classification] = (bucket[m.classification] ?? 0) + 1;
  }

  const rows = CLS_ORDER.filter(
    (cls) => (whiteCounts[cls] ?? 0) > 0 || (blackCounts[cls] ?? 0) > 0,
  );

  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="grid grid-cols-[1fr_28px_1fr] items-center gap-x-2 mb-1">
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest text-right">White</span>
        <span />
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Black</span>
      </div>
      {rows.map((cls) => {
        const info = CLS_LABEL[cls];
        const w = whiteCounts[cls] ?? 0;
        const b = blackCounts[cls] ?? 0;
        return (
          <div key={cls} className="grid grid-cols-[1fr_28px_1fr] items-center gap-x-2 py-0.5">
            <span className={`text-xs text-right font-mono ${w > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>{w}</span>
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ backgroundColor: info.badgeBg, color: info.badgeText }}
            >
              {info.symbol || '·'}
            </span>
            <span className={`text-xs font-mono ${b > 0 ? 'text-zinc-200' : 'text-zinc-700'}`}>{b}</span>
          </div>
        );
      })}
    </div>
  );
}
