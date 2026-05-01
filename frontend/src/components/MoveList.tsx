'use client';

import { useRef, useEffect } from 'react';
import type { AnalysisResult, Classification, MoveEval } from '@/types';
import { ClassificationIcon, CLASSIFICATION_COLOR } from './ClassificationIcon';

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
  /** Map of normalised FEN → prep SAN for deviation detection */
  repertoirePrep?: Map<string, string>;
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

const SHOW_ICON = new Set<Classification>(['brilliant', 'great', 'book', 'blunder']);

function normFen(fen: string) {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function MoveList({ result, selectedPly, onSelectPly, exploreMoves, branchPly, activeExploreIdx, onSelectExploreMove, showEval = true, repertoirePrep }: Props) {
  const { moves } = result;
  const hasBranch = !!exploreMoves?.length;
  const containerRef = useRef<HTMLDivElement>(null);

  // Map ply → FEN before that move (used for repertoire deviation lookup)
  const fenBeforeByPly = new Map<number, string>();
  if (repertoirePrep) {
    moves.forEach((m, i) => {
      fenBeforeByPly.set(m.ply, normFen(i === 0 ? result.starting_fen : moves[i - 1].fen));
    });
  }

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
              <MoveColumn move={white} selected={selectedPly === white.ply} onSelect={onSelectPly} showEval={showEval} prepSan={repertoirePrep && fenBeforeByPly.has(white.ply) ? repertoirePrep.get(fenBeforeByPly.get(white.ply)!) : undefined} />
              {black
                ? <MoveColumn move={black} selected={selectedPly === black.ply} onSelect={onSelectPly} showEval={showEval} prepSan={repertoirePrep && fenBeforeByPly.has(black.ply) ? repertoirePrep.get(fenBeforeByPly.get(black.ply)!) : undefined} />
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

function MoveColumn({
  move, selected, onSelect, showEval, prepSan,
}: { move: MoveEval; selected: boolean; onSelect: (ply: number | null) => void; showEval: boolean; prepSan?: string }) {
  const showIcon = move.classification && SHOW_ICON.has(move.classification);
  // Out of prep: position was in repertoire but played move differs
  const outOfPrep = prepSan != null && !move.is_book && move.san !== prepSan;
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
        {showIcon && move.classification && (
          <span className="shrink-0 flex items-center">
            <ClassificationIcon classification={move.classification} size={14} />
          </span>
        )}
        {outOfPrep && (
          <span className="text-[10px] font-semibold text-amber-400/80 shrink-0" title={`Prep: ${prepSan}`}>
            ↩{prepSan}
          </span>
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
              {m.classification && SHOW_ICON.has(m.classification) && (
                <span className="flex items-center">
                  <ClassificationIcon classification={m.classification} size={11} />
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
