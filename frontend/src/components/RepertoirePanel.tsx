'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';

const Chessboard = dynamic(
  () => import('react-chessboard').then((m) => m.Chessboard),
  { ssr: false },
);
import { Trash2, Download, BookOpen, Dumbbell } from 'lucide-react';
import {
  getRepertoire,
  addRepertoireMove,
  deleteRepertoireMove,
  importFromGames,
  type ImportCandidate,
} from '@/lib/library';
import type { RepertoireMove } from '@/types';

type Mode = 'build' | 'drill';
type DrillResult = 'correct' | 'wrong' | null;

interface Props {
  onBack: () => void;
}

export function RepertoirePanel({ onBack }: Props) {
  const [color, setColor]               = useState<'white' | 'black'>('white');
  const [mode, setMode]                 = useState<Mode>('build');
  const [moves, setMoves]               = useState<RepertoireMove[]>([]);
  const [chess, setChess]               = useState(() => new Chess());
  const [fen, setFen]                   = useState(new Chess().fen());
  const [history, setHistory]           = useState<string[]>([]); // SAN history
  const [prepMove, setPrepMove]         = useState<RepertoireMove | null>(null);
  const [importing, setImporting]       = useState(false);
  const [candidates, setCandidates]     = useState<ImportCandidate[]>([]);
  const [drillResult, setDrillResult]   = useState<DrillResult>(null);
  const [drillScore, setDrillScore]     = useState({ correct: 0, total: 0 });

  // Load full repertoire for current color
  const loadRepertoire = useCallback(async () => {
    try {
      const data = await getRepertoire(color);
      setMoves(data);
    } catch (e) {
      console.error('Failed to load repertoire', e);
    }
  }, [color]);

  useEffect(() => {
    loadRepertoire();
    resetBoard();
  }, [color]); // eslint-disable-line react-hooks/exhaustive-deps

  // When position changes, look up prep move for this FEN
  useEffect(() => {
    const current = moves.find(m => normFen(m.fen) === normFen(fen));
    setPrepMove(current ?? null);
  }, [fen, moves]);

  function normFen(f: string) {
    return f.split(' ').slice(0, 4).join(' ');
  }

  function resetBoard() {
    const c = new Chess();
    setChess(c);
    setFen(c.fen());
    setHistory([]);
    setDrillResult(null);
  }

  // --------------------------------------------------------------------------
  // Build mode: user plays moves on board
  // --------------------------------------------------------------------------
  async function onDrop(from: string, to: string) {
    if (mode !== 'build') return false;

    const c = chess;
    let move;
    try {
      move = c.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    if (!move) return false;

    const newFen = c.fen();
    setFen(newFen);

    // Save to repertoire only if it's the correct side to move
    const isWhiteTurn = c.turn() === 'w'; // after the move, turn has flipped
    const savedColor = isWhiteTurn ? 'black' : 'white'; // the side that just moved

    if (savedColor === color) {
      try {
        // The key FEN is the position BEFORE the move (i.e., current fen before pushing)
        const fenBeforeMove = fen;
        const saved = await addRepertoireMove({
          fen: normFen(fenBeforeMove),
          move: move.from + move.to + (move.promotion ?? ''),
          san: move.san,
          color,
          notes: '',
        });
        setMoves(prev => {
          const filtered = prev.filter(m => normFen(m.fen) !== normFen(saved.fen));
          return [...filtered, saved];
        });
      } catch (e) {
        console.error('Failed to save move', e);
      }
    }

    setHistory(prev => [...prev, move.san]);
    setChess(new Chess(newFen));
    return true;
  }

  async function handleDelete(move: RepertoireMove) {
    try {
      await deleteRepertoireMove(move.fen, color);
      setMoves(prev => prev.filter(m => m.id !== move.id));
    } catch (e) {
      console.error('Failed to delete move', e);
    }
  }

  // --------------------------------------------------------------------------
  // Drill mode
  // --------------------------------------------------------------------------
  function startDrill() {
    setMode('drill');
    setDrillScore({ correct: 0, total: 0 });
    resetBoard();
    // If color is black, play white's first move automatically
    if (color === 'black') {
      playOpponentMove(new Chess());
    }
  }

  function playOpponentMove(c: Chess) {
    // Pick a random legal move that is NOT in repertoire (opponent wanders freely)
    const legalMoves = c.moves({ verbose: true });
    if (legalMoves.length === 0) return;
    const pick = legalMoves[Math.floor(Math.random() * legalMoves.length)];
    c.move(pick);
    const newFen = c.fen();
    setChess(new Chess(newFen));
    setFen(newFen);
  }

  async function onDrillDrop(from: string, to: string) {
    if (mode !== 'drill') return false;

    // Only allow moves when it's the player's turn
    const isWhiteTurn = chess.turn() === 'w';
    const playerIsWhite = color === 'white';
    if (isWhiteTurn !== playerIsWhite) return false;

    const c = chess;
    let move;
    try {
      move = c.move({ from, to, promotion: 'q' });
    } catch {
      return false;
    }
    if (!move) return false;

    const newFen = c.fen();
    const preMoveNorm = normFen(fen);
    const prepEntry = moves.find(m => normFen(m.fen) === preMoveNorm);
    const playedUci = move.from + move.to + (move.promotion ?? '');

    setDrillScore(prev => ({ ...prev, total: prev.total + 1 }));

    if (prepEntry && prepEntry.move === playedUci) {
      setDrillResult('correct');
      setDrillScore(prev => ({ ...prev, correct: prev.correct + 1 }));
      // Continue: play opponent move
      const updated = new Chess(newFen);
      setChess(updated);
      setFen(newFen);
      setTimeout(() => {
        setDrillResult(null);
        playOpponentMove(updated);
      }, 800);
    } else {
      setDrillResult('wrong');
      setChess(new Chess(newFen));
      setFen(newFen);
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // Import
  // --------------------------------------------------------------------------
  async function handleImport() {
    setImporting(true);
    try {
      const data = await importFromGames(color);
      setCandidates(data);
    } catch (e) {
      console.error('Import failed', e);
    } finally {
      setImporting(false);
    }
  }

  async function addCandidate(c: ImportCandidate) {
    try {
      const saved = await addRepertoireMove({
        fen: c.fen,
        move: c.move,
        san: c.san,
        color,
        notes: '',
      });
      setMoves(prev => {
        const filtered = prev.filter(m => normFen(m.fen) !== normFen(saved.fen));
        return [...filtered, saved];
      });
      setCandidates(prev => prev.filter(x => x.fen !== c.fen));
    } catch (e) {
      console.error('Failed to add candidate', e);
    }
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  const boardOrientation = color === 'white' ? 'white' : 'black';
  const dropHandler = mode === 'drill' ? onDrillDrop : onDrop;

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] text-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <button onClick={onBack} className="text-sm text-white/50 hover:text-white transition-colors">
          ← Back
        </button>
        <h2 className="text-sm font-semibold tracking-wide">Opening Repertoire</h2>
        <div className="flex gap-1">
          {(['white', 'black'] as const).map(c => (
            <button
              key={c}
              onClick={() => { setColor(c); setMode('build'); }}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                color === c
                  ? 'bg-white text-black'
                  : 'bg-white/10 text-white/60 hover:bg-white/20'
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Board side — takes up ~60% of the width, square board centred */}
        <div className="flex flex-col items-center justify-center gap-3 p-6 flex-[3] shrink-0 border-r border-white/10">
          <div className="w-full max-w-[560px] aspect-square">
            <Chessboard
              options={{
                position: fen,
                boardOrientation,
                onPieceDrop: ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null; [k: string]: unknown }) => {
                  if (!targetSquare) return false;
                  void dropHandler(sourceSquare, targetSquare);
                  return true;
                },
                darkSquareStyle: { backgroundColor: '#769656' },
                lightSquareStyle: { backgroundColor: '#eeeed2' },
                boardStyle: { borderRadius: '4px' },
                allowDragging: true,
                animationDurationInMs: 150,
              }}
            />
          </div>

          {/* Drill result feedback */}
          {mode === 'drill' && drillResult && (
            <div className={`w-full text-center text-sm font-semibold py-2 rounded ${
              drillResult === 'correct' ? 'bg-green-600/30 text-green-400' : 'bg-red-600/30 text-red-400'
            }`}>
              {drillResult === 'correct' ? '✓ Correct!' : `✗ Wrong — prep was ${prepMove?.san ?? '?'}`}
            </div>
          )}

          {/* Move history */}
          {history.length > 0 && (
            <div className="w-full text-xs text-white/40 text-center">
              {history.join(' ')}
            </div>
          )}

          {/* Controls */}
          <div className="flex gap-2 w-full">
            <button
              onClick={resetBoard}
              className="flex-1 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs text-white/70 transition-colors"
            >
              Reset
            </button>
            {mode === 'build' ? (
              <button
                onClick={startDrill}
                className="flex-1 py-1.5 rounded bg-[#5c8fff]/80 hover:bg-[#5c8fff] text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1"
              >
                <Dumbbell size={12} /> Drill
              </button>
            ) : (
              <button
                onClick={() => { setMode('build'); resetBoard(); }}
                className="flex-1 py-1.5 rounded bg-white/10 hover:bg-white/20 text-xs text-white/70 transition-colors flex items-center justify-center gap-1"
              >
                <BookOpen size={12} /> Build
              </button>
            )}
          </div>

          {/* Drill score */}
          {mode === 'drill' && (
            <div className="text-xs text-white/50">
              Score: {drillScore.correct} / {drillScore.total}
            </div>
          )}
        </div>

        {/* Right side: line list + import */}
        <div className="flex flex-col flex-[2] overflow-hidden min-w-[260px] max-w-sm">
          {/* Prep move for current position */}
          {prepMove && mode === 'build' && (
            <div className="flex items-center justify-between px-4 py-2 bg-[#5c8fff]/10 border-b border-[#5c8fff]/20">
              <span className="text-xs text-[#5c8fff]">
                Prep here: <span className="font-bold">{prepMove.san}</span>
              </span>
              <button onClick={() => handleDelete(prepMove)} className="text-white/30 hover:text-red-400 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          )}

          {/* Saved lines */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-4 py-2 text-xs text-white/30 uppercase tracking-widest border-b border-white/5">
              Saved moves ({moves.length})
            </div>
            {moves.length === 0 ? (
              <div className="px-4 py-6 text-xs text-white/30 text-center">
                Play moves on the board to build your prep
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {moves.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-2 hover:bg-white/5 group">
                    <span className="text-sm font-mono font-medium">{m.san}</span>
                    <button
                      onClick={() => handleDelete(m)}
                      className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Import section */}
          <div className="border-t border-white/10 px-4 py-3">
            <button
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-2 text-xs text-white/50 hover:text-white transition-colors disabled:opacity-40"
            >
              <Download size={13} />
              {importing ? 'Scanning games…' : 'Import from saved games'}
            </button>

            {candidates.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {candidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-white/70">
                      {c.san}
                      <span className="text-white/30 ml-1">×{c.count}</span>
                    </span>
                    <button
                      onClick={() => addCandidate(c)}
                      className="text-[#5c8fff] hover:underline"
                    >
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
