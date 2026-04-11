'use client';

import { useRef, useEffect } from 'react';
import type { AnalysisResult, Classification, MoveEval } from '@/types';

export interface ExploreMoveData {
  san: string;
  classification: Classification | null;
}

interface Props {
  result: AnalysisResult;
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
  exploreMoves?: ExploreMoveData[];
  branchPly?: number | null;
  activeExploreIdx?: number;
  onSelectExploreMove?: (idx: number) => void;
  showEval?: boolean;
}

function formatEval(cp: number): string {
  if (cp >= 10000)  return `M${cp - 10000}`;
  if (cp <= -10000) return `-M${-cp - 10000}`;
  const pawns = cp / 100;
  return (pawns > 0 ? '+' : '') + pawns.toFixed(2);
}

function evalColor(cp: number): string {
  if (cp > 150) return 'text-white';
  if (cp > 0) return 'text-zinc-300';
  if (cp > -150) return 'text-zinc-400';
  return 'text-zinc-500';
}

const CLASSIFICATION_STYLE: Record<Classification, { symbol: string; className: string }> = {
  book:       { symbol: '⊕',  className: 'text-[#a0784a]' },
  brilliant:  { symbol: '!!', className: 'text-[#1fada8]' },
  great:      { symbol: '!',  className: 'text-[#5c8fff]' },
  best:       { symbol: '★',  className: 'text-[#6fbc5b]' },
  excellent:  { symbol: '✦',  className: 'text-[#6fbc5b]' },
  good:       { symbol: '✓',  className: 'text-[#96bc4b]' },
  inaccuracy: { symbol: '?!', className: 'text-[#f4bf00]' },
  mistake:    { symbol: '?',  className: 'text-[#e07b2a]' },
  miss:       { symbol: '⊘',  className: 'text-[#e05c2a]' },
  blunder:    { symbol: '??', className: 'text-[#ca3431]' },
};

export function MoveList({ result, selectedPly, onSelectPly, exploreMoves, branchPly, activeExploreIdx, onSelectExploreMove, showEval = true }: Props) {
  const { moves } = result;
  const hasBranch = !!exploreMoves?.length;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedPly]);

  // Group into pairs
  const pairs: Array<{ moveNum: number; white: MoveEval; black?: MoveEval }> = [];
  for (let i = 0; i < moves.length; i += 2) {
    pairs.push({
      moveNum: Math.floor(moves[i].ply / 2),
      white: moves[i],
      black: moves[i + 1],
    });
  }

  return (
    <div ref={containerRef} className="divide-y divide-zinc-800/50">
      {/* Branch from start position (branchPly === null) */}
      {hasBranch && (branchPly === null || branchPly === 0) && (
        <ExploreBranch moves={exploreMoves!} branchPly={branchPly} activeIdx={activeExploreIdx} onSelectMove={onSelectExploreMove} />
      )}

      {pairs.map(({ moveNum, white, black }) => {
        const branchAfterWhite = hasBranch && branchPly === white.ply;
        const branchAfterBlack = hasBranch && black && branchPly === black.ply;

        return (
          <div key={moveNum}>
            <div className="grid grid-cols-[2rem_1fr_1fr] gap-x-3 px-4 py-1 text-sm items-center">
              <span className="text-zinc-600 text-xs">{moveNum}</span>
              <MoveColumn move={white} selected={selectedPly === white.ply} onSelect={onSelectPly} showEval={showEval} />
              {black
                ? <MoveColumn move={black} selected={selectedPly === black.ply} onSelect={onSelectPly} showEval={showEval} />
                : <span />}
            </div>

            {/* Branch after white's move in this pair */}
            {branchAfterWhite && <ExploreBranch moves={exploreMoves!} indentWhite branchPly={branchPly} activeIdx={activeExploreIdx} onSelectMove={onSelectExploreMove} />}

            {/* Branch after black's move in this pair */}
            {branchAfterBlack && <ExploreBranch moves={exploreMoves!} branchPly={branchPly} activeIdx={activeExploreIdx} onSelectMove={onSelectExploreMove} />}
          </div>
        );
      })}
    </div>
  );
}

const SHOW_SYMBOL = new Set<Classification>(['book', 'brilliant', 'great', 'blunder']);

function MoveColumn({
  move, selected, onSelect, showEval,
}: { move: MoveEval; selected: boolean; onSelect: (ply: number | null) => void; showEval: boolean }) {
  const cls = move.classification ? CLASSIFICATION_STYLE[move.classification] : null;
  const showSymbol = move.classification && SHOW_SYMBOL.has(move.classification) && cls?.symbol;
  return (
    <button
      data-active={selected ? 'true' : 'false'}
      onClick={() => onSelect(move.ply)}
      className={`w-full flex items-center min-w-0 rounded px-1.5 py-0.5 transition-colors cursor-pointer ${
        showEval ? 'justify-between' : 'justify-start'
      } ${selected ? 'bg-zinc-700/60' : 'hover:bg-zinc-800/40'}`}
    >
      <div className="flex items-center gap-1 min-w-0">
        <span className="font-mono">{move.san}</span>
        {showSymbol && (
          <span className={`text-xs font-bold shrink-0 ${cls?.className}`}>{cls?.symbol}</span>
        )}
      </div>
      {showEval && (
        <span className={`text-xs font-mono shrink-0 ml-2 ${evalColor(move.eval)}`}>
          {formatEval(move.eval)}
        </span>
      )}
    </button>
  );
}


function ExploreBranch({
  moves,
  indentWhite,
  branchPly,
  activeIdx,
  onSelectMove,
}: {
  moves: ExploreMoveData[];
  indentWhite?: boolean;
  branchPly?: number | null;
  activeIdx?: number;
  onSelectMove?: (idx: number) => void;
}) {
  return (
    <div className={`px-4 py-1.5 border-l-2 border-zinc-700 ${indentWhite ? 'ml-10' : 'ml-4'} mr-4 mb-1 rounded-sm bg-zinc-900/40`}>
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 items-center">
        <span className="text-zinc-600 text-xs mr-1">↳</span>
        {moves.map((m, i) => {
          const ply = (branchPly ?? 0) + 1 + i;
          const moveNum = Math.ceil(ply / 2);
          const isWhite = ply % 2 === 1;
          const showNum = i === 0 || isWhite;
          const isActive = activeIdx === i;
          const cls = m.classification ? CLASSIFICATION_STYLE[m.classification] : null;
          return (
            <span key={i} className="flex items-center gap-0.5">
              {showNum && (
                <span className="text-zinc-500 text-xs font-mono select-none">
                  {moveNum}{isWhite ? '.' : '...'}
                </span>
              )}
              <button
                onClick={() => onSelectMove?.(i)}
                className={`font-mono text-xs rounded px-1 py-0.5 transition-colors cursor-pointer ${
                  isActive ? 'bg-zinc-700/60 text-white' : 'text-zinc-300 hover:bg-zinc-700/40 hover:text-white'
                }`}
              >
                {m.san}
              </button>
              {cls?.symbol && (
                <span className={`text-[10px] font-bold ${cls.className}`}>{cls.symbol}</span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
