'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { defaultPieces } from 'react-chessboard';
import type { TopLine } from '@/types';

interface Props {
  lines: TopLine[];
  isWhiteToMove: boolean;
  depth?: number;
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10000) {
    const n = Math.abs(cp) - 10000;
    return `M${n}`;
  }
  return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
}

// Always from White's perspective so the color doesn't flip every move
function evalBadgeClass(cp: number): string {
  if (cp > 150)  return 'bg-white text-black';
  if (cp > 20)   return 'bg-zinc-200 text-zinc-900';
  if (cp > -20)  return 'bg-zinc-600 text-zinc-100';
  if (cp > -150) return 'bg-zinc-700 text-zinc-300';
  return 'bg-zinc-800 text-zinc-400';
}

const SAN_TO_TYPE: Record<string, string> = { N: 'N', B: 'B', R: 'R', Q: 'Q', K: 'K' };

function PieceIcon({ san, isWhite, size = 15 }: { san: string; isWhite: boolean; size?: number }) {
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

function MoveToken({ san, isWhite }: { san: string; isWhite: boolean }) {
  const hasPiece = /^[NBRQK]/.test(san);
  const rest = hasPiece ? san.slice(1) : san;
  return (
    <span className="inline-flex items-center gap-px shrink-0">
      {hasPiece && <PieceIcon san={san} isWhite={isWhite} size={15} />}
      <span className="font-mono">{rest}</span>
    </span>
  );
}

const GAP = 6;    // px — matches gap-x-1.5
const BTN = 28;   // px — width reserved for the ▼ button (including its own padding)

function LineRow({ line, isWhiteToMove }: { line: TopLine; isWhiteToMove: boolean }) {
  const measureRef = useRef<HTMLDivElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const [cutAt, setCutAt]     = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);

  const moves = line.moves?.length ? line.moves : [line.san];

  // Measure using the hidden div (always contains all moves)
  useLayoutEffect(() => {
    if (expanded) { setCutAt(null); return; }
    const measure = measureRef.current;
    const wrap    = wrapRef.current;
    if (!measure || !wrap) return;

    const available = wrap.offsetWidth - BTN;
    const items = Array.from(measure.children) as HTMLElement[];
    let w = 0;
    for (let i = 0; i < items.length; i++) {
      w += items[i].offsetWidth + (i > 0 ? GAP : 0);
      if (w > available) { setCutAt(i); return; }
    }
    setCutAt(null); // all moves fit
  }, [moves.join(','), expanded]);

  const hasMore = cutAt !== null;
  const visible = hasMore ? moves.slice(0, cutAt) : moves;

  return (
    <div className="px-3 py-2 border-b border-zinc-800 last:border-b-0">
      <div className="flex items-center gap-2 min-w-0">

        {/* Eval badge */}
        <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded shrink-0 font-bold ${evalBadgeClass(line.eval)}`}>
          {formatEval(line.eval)}
        </span>

        {/* Moves area */}
        <div ref={wrapRef} className="relative flex-1 min-w-0 overflow-hidden">

          {/* Hidden measurement div — always renders ALL moves */}
          <div
            ref={measureRef}
            className="absolute top-0 left-0 right-0 flex items-center gap-x-1.5 invisible pointer-events-none"
            aria-hidden="true"
          >
            {moves.map((san, j) => (
              <MoveToken key={j} san={san} isWhite={isWhiteToMove ? j % 2 === 0 : j % 2 === 1} />
            ))}
          </div>

          {/* Visible moves */}
          <div className={`flex items-center gap-x-1.5 text-white text-xs ${expanded ? 'flex-wrap gap-y-1' : ''}`}>
            {visible.map((san, j) => (
              <MoveToken key={j} san={san} isWhite={isWhiteToMove ? j % 2 === 0 : j % 2 === 1} />
            ))}
            {!expanded && hasMore && <span className="text-zinc-500 shrink-0">…</span>}
          </div>
        </div>

        {/* Toggle — same padding on both sides */}
        {(hasMore || expanded) && (
          <button
            onClick={() => setExpanded(p => !p)}
            className="shrink-0 w-6 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            title={expanded ? 'Collapse' : 'Show full line'}
          >
            {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
    </div>
  );
}

export function EngineLines({ lines, isWhiteToMove, depth }: Props) {
  if (!lines.length) return null;

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-700 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
        <span className="text-zinc-300 uppercase tracking-widest text-[10px] font-semibold">
          Analysis
        </span>
        <span className="text-zinc-400 font-mono text-[10px]">
          {depth != null ? `depth ${depth}` : <span className="text-zinc-600">searching…</span>}
        </span>
      </div>

      {/* Lines */}
      <div className="bg-zinc-900">
        {lines.map((line, i) => (
          <LineRow key={i} line={line} isWhiteToMove={isWhiteToMove} />
        ))}
      </div>
    </div>
  );
}
