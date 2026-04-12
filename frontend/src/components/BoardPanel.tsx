'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { EvalBar } from './EvalBar';

const Chessboard = dynamic(
  () => import('react-chessboard').then((m) => m.Chessboard),
  { ssr: false },
);

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface Props {
  fen: string;
  lastMove: { from: string; to: string } | null;
  evalCp: number;
  orientation: 'white' | 'black';
  onPieceDrop: (from: string, to: string) => boolean;
  size?: number;
  badge?: React.ReactNode;
  badgeScale?: number;
  showEvalBar?: boolean;
  animatePieces?: boolean;
}

function normaliseFen(fen: string) {
  return fen === 'start' ? STARTING_FEN : fen;
}

function makeChess(fen: string) {
  return new Chess(normaliseFen(fen));
}

export function BoardPanel({ fen, lastMove, evalCp, orientation, onPieceDrop, size = 400, badge, badgeScale = 1, showEvalBar = true, animatePieces = true }: Props) {
  const BOARD_SIZE = size;
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalTargets, setLegalTargets] = useState<{ sq: string; capture: boolean }[]>([]);
  const [rightClicked, setRightClicked] = useState<Record<string, boolean>>({});

  // Clear selection + right-click highlights whenever position changes
  useEffect(() => {
    setSelectedSquare(null);
    setLegalTargets([]);
    setRightClicked({});
  }, [fen]);

  function selectSquare(square: string) {
    const chess = makeChess(fen);
    const moves = chess.moves({ square: square as Square, verbose: true }) as Move[];
    if (moves.length === 0) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }
    setSelectedSquare(square);
    setLegalTargets(moves.map((m) => ({ sq: m.to, capture: !!m.captured })));
  }

  function handleSquareClick({ square }: { square: string }) {
    // Clear any right-click highlights on left-click
    setRightClicked({});

    const target = legalTargets.find((t) => t.sq === square);
    if (selectedSquare && target) {
      const accepted = onPieceDrop(selectedSquare, square);
      setSelectedSquare(null);
      setLegalTargets([]);
      if (!accepted) return;
      return;
    }
    if (square === selectedSquare) {
      setSelectedSquare(null);
      setLegalTargets([]);
      return;
    }
    selectSquare(square);
  }

  function handleSquareRightClick({ square }: { square: string }) {
    setRightClicked((prev) => ({ ...prev, [square]: !prev[square] }));
  }

  // Build square styles
  const squareStyles: Record<string, React.CSSProperties> = {};

  // Last-move: bright yellow-green that stands out on both light and dark squares
  if (lastMove) {
    squareStyles[lastMove.from] = { backgroundColor: 'rgba(172,206,89,0.75)' };
    squareStyles[lastMove.to]   = { backgroundColor: 'rgba(172,206,89,0.95)' };
  }

  // Selected piece highlight
  if (selectedSquare) {
    squareStyles[selectedSquare] = { backgroundColor: 'rgba(255,255,0,0.45)' };
  }

  // Legal move dots / capture rings
  for (const { sq, capture } of legalTargets) {
    squareStyles[sq] = capture
      ? { background: 'radial-gradient(circle, transparent 58%, rgba(0,0,0,0.20) 58%)', borderRadius: '0' }
      : { background: 'radial-gradient(circle, rgba(0,0,0,0.18) 26%, transparent 26%)' };
  }

  // Right-click red highlights (applied last so they override)
  for (const [sq, active] of Object.entries(rightClicked)) {
    if (active) squareStyles[sq] = { backgroundColor: 'rgba(220,50,50,0.55)' };
  }

  return (
    <div className="flex gap-2 items-start shrink-0">
      {showEvalBar && <EvalBar eval={evalCp} height={BOARD_SIZE} orientation={orientation} />}
      <div style={{ width: BOARD_SIZE, height: BOARD_SIZE }} className="relative">
        {badge && lastMove && (() => {
          const sq = lastMove.to;
          const fileIdx = sq.charCodeAt(0) - 97;       // a=0 … h=7
          const rankIdx = parseInt(sq[1]) - 1;          // 1=0 … 8=7
          const sqSize  = BOARD_SIZE / 8;
          const col = orientation === 'white' ? fileIdx     : 7 - fileIdx;
          const row = orientation === 'white' ? 7 - rankIdx : rankIdx;
          const BADGE = sqSize * 0.35 * badgeScale;
          const left = col * sqSize + sqSize - BADGE - 3;
          const top  = row * sqSize + 3;
          return (
            <div
              className="absolute z-10 pointer-events-none"
              style={{ left, top, width: BADGE, height: BADGE }}
            >
              {badge}
            </div>
          );
        })()}
        <Chessboard
          options={{
            position: normaliseFen(fen),
            boardOrientation: orientation,
            squareStyles,
            darkSquareStyle: { backgroundColor: '#769656' },
            lightSquareStyle: { backgroundColor: '#eeeed2' },
            boardStyle: { borderRadius: '4px' },
            alphaNotationStyle: { fontSize: `${Math.round(BOARD_SIZE / 8 * 0.20)}px`, fontWeight: 'bold' },
            numericNotationStyle: { fontSize: `${Math.round(BOARD_SIZE / 8 * 0.20)}px`, fontWeight: 'bold' },
            darkSquareNotationStyle: { color: '#eeeed2' },
            lightSquareNotationStyle: { color: '#769656' },
            allowDragging: true,
            animationDurationInMs: animatePieces ? 150 : 0,
            onSquareClick: handleSquareClick,
            onSquareRightClick: handleSquareRightClick,
            onPieceDrop: ({ sourceSquare, targetSquare }) => {
              if (!targetSquare) return false;
              setSelectedSquare(null);
              setLegalTargets([]);
              return onPieceDrop(sourceSquare, targetSquare);
            },
            onPieceDrag: () => {
              setSelectedSquare(null);
              setLegalTargets([]);
            },
          }}
        />
      </div>
    </div>
  );
}
