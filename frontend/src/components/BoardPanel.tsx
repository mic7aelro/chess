'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useMemo } from 'react';
import { Chess, type Square, type Move } from 'chess.js';
import { EvalBar } from './EvalBar';
import { customPieces } from '../lib/pieces';

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

  const squareStyles = useMemo<Record<string, React.CSSProperties>>(() => {
    const styles: Record<string, React.CSSProperties> = {};

    if (lastMove) {
      styles[lastMove.from] = { backgroundColor: 'rgba(172,206,89,0.75)' };
      styles[lastMove.to]   = { backgroundColor: 'rgba(172,206,89,0.95)' };
    }

    if (selectedSquare) {
      styles[selectedSquare] = { backgroundColor: 'rgba(255,255,0,0.45)' };
    }

    for (const { sq, capture } of legalTargets) {
      styles[sq] = capture
        ? { background: 'radial-gradient(circle, transparent 58%, rgba(0,0,0,0.20) 58%)', borderRadius: '0' }
        : { background: 'radial-gradient(circle, rgba(0,0,0,0.18) 26%, transparent 26%)' };
    }

    for (const [sq, active] of Object.entries(rightClicked)) {
      if (active) styles[sq] = { backgroundColor: 'rgba(220,50,50,0.55)' };
    }

    return styles;
  }, [lastMove, selectedSquare, legalTargets, rightClicked]);

  return (
    <div className="flex items-stretch shrink-0">
      {showEvalBar && <EvalBar eval={evalCp} height={BOARD_SIZE} orientation={orientation} />}
      <div
        style={{ width: BOARD_SIZE, height: BOARD_SIZE, colorScheme: 'light' }}
        className="relative"
      >
        {badge && lastMove && (() => {
          const sq = lastMove.to;
          const fileIdx = sq.charCodeAt(0) - 97;
          const rankIdx = parseInt(sq[1]) - 1;
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
            darkSquareStyle:  { backgroundColor: '#769656' },
            lightSquareStyle: { backgroundColor: '#eeeed2' },
            boardStyle: {
              borderRadius: showEvalBar ? '0 var(--r-sm) var(--r-sm) 0' : 'var(--r-sm)',
              position: 'relative',
              zIndex: 1,
            } as React.CSSProperties,
            alphaNotationStyle:       { fontSize: `${Math.round(BOARD_SIZE / 8 * 0.20)}px`, fontWeight: 'bold' },
            numericNotationStyle:     { fontSize: `${Math.round(BOARD_SIZE / 8 * 0.20)}px`, fontWeight: 'bold' },
            darkSquareNotationStyle:  { color: '#eeeed2' },
            lightSquareNotationStyle: { color: '#769656' },
            pieces: customPieces,
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
