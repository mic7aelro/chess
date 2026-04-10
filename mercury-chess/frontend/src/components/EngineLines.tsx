'use client';

import { useState } from 'react';
import { defaultPieces } from 'react-chessboard';
import type { TopLine } from '@/types';

interface Props {
  lines: TopLine[];
  isWhiteToMove: boolean;
  depth?: number;
}

function formatEval(cp: number, isWhiteToMove: boolean): string {
  if (cp >= 10000) return '+M';
  if (cp <= -10000) return '-M';
  const v = isWhiteToMove ? cp : -cp;
  return (v >= 0 ? '+' : '') + (v / 100).toFixed(2);
}

function evalBadgeClass(cp: number, isWhiteToMove: boolean): string {
  const v = isWhiteToMove ? cp : -cp;
  if (v > 150)  return 'bg-white text-black';
  if (v > 20)   return 'bg-zinc-200 text-zinc-900';
  if (v > -20)  return 'bg-zinc-600 text-zinc-100';
  if (v > -150) return 'bg-zinc-700 text-zinc-300';
  return 'bg-zinc-800 text-zinc-400';
}

const SAN_TO_TYPE: Record<string, string> = { N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' };

function PieceIcon({ san, isWhite, size = 16 }: { san: string; isWhite: boolean; size?: number }) {
  const letter = san.match(/^([NBRQK])/)?.[1];
  if (!letter) return null;
  const key = (isWhite ? 'w' : 'b') + SAN_TO_TYPE[letter];
  const Svg = defaultPieces[key];
  if (!Svg) return null;
  return (
    <span
      className="inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size, verticalAlign: 'middle', lineHeight: 0 }}
    >
      <Svg svgStyle={{ width: size, height: size, display: 'block' }} />
    </span>
  );
}

function MoveToken({ san, isWhite, dim }: { san: string; isWhite: boolean; dim: boolean }) {
  const hasPiece = /^[NBRQK]/.test(san);
  const rest = hasPiece ? san.slice(1) : san;
  return (
    <span className={`inline-flex items-center gap-px ${dim ? 'opacity-60' : ''}`}>
      {hasPiece && <PieceIcon san={san} isWhite={isWhite} size={15} />}
      <span className="font-mono">{rest}</span>
    </span>
  );
}

export function EngineLines({ lines, isWhiteToMove, depth }: Props) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  if (!lines.length) return null;

  const PREVIEW = 4; // moves shown before truncating

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <span className="text-zinc-300 uppercase tracking-widest text-[10px] font-semibold">
          Analysis
        </span>
        <span className="text-zinc-500 font-mono text-[10px]">
          {depth != null ? `depth=${depth}` : ''}
        </span>
      </div>

      {/* Lines */}
      <div className="bg-zinc-900">
        {lines.map((line, i) => {
          const moves = line.moves?.length ? line.moves : [line.san];
          const isExpanded = !!expanded[i];
          const visible = isExpanded ? moves : moves.slice(0, PREVIEW);
          const hasMore = moves.length > PREVIEW;

          return (
            <div
              key={i}
              className="px-3 py-2 border-b border-zinc-800 last:border-b-0"
            >
              <div className="flex items-start gap-2">
                {/* Eval badge */}
                <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded shrink-0 font-bold ${evalBadgeClass(line.eval, isWhiteToMove)}`}>
                  {formatEval(line.eval, isWhiteToMove)}
                </span>

                {/* Move sequence */}
                <span className="flex items-center flex-wrap gap-x-1.5 gap-y-1 min-w-0 flex-1 text-zinc-200">
                  {visible.map((san, j) => {
                    const isWhiteMove = isWhiteToMove ? j % 2 === 0 : j % 2 === 1;
                    return (
                      <MoveToken key={j} san={san} isWhite={isWhiteMove} dim={j > 0} />
                    );
                  })}
                  {!isExpanded && hasMore && (
                    <span className="text-zinc-500">…</span>
                  )}
                </span>

                {/* Expand / collapse toggle */}
                {hasMore && (
                  <button
                    onClick={() => setExpanded((p) => ({ ...p, [i]: !p[i] }))}
                    className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer ml-1 mt-0.5"
                    title={isExpanded ? 'Collapse' : 'Show full line'}
                  >
                    {isExpanded ? '▲' : '▼'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
