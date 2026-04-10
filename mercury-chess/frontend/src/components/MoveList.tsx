'use client';

import type { AnalysisResult, Classification, MoveEval, TopLine } from '@/types';

export interface ExploreMoveData {
  san: string;
  classification: Classification | null;
}

interface Props {
  result: AnalysisResult;
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
  exploreMoves?: ExploreMoveData[];   // [...exploreStack, exploreFrame] as simplified data
  branchPly?: number | null;          // selectedPly when explore started
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10000) return cp > 0 ? '+M' : '-M';
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
  book:       { symbol: '⊕',  className: 'text-zinc-500' },
  brilliant:  { symbol: '!!', className: 'text-[#1fada8]' },
  great:      { symbol: '!',  className: 'text-[#5c8fff]' },
  best:       { symbol: '★',  className: 'text-[#6fbc5b]' },
  excellent:  { symbol: '✓',  className: 'text-[#96bc4b]' },
  good:       { symbol: '',   className: '' },
  inaccuracy: { symbol: '?!', className: 'text-[#f4bf00]' },
  mistake:    { symbol: '?',  className: 'text-[#e07b2a]' },
  miss:       { symbol: '⊘',  className: 'text-[#e05c2a]' },
  blunder:    { symbol: '??', className: 'text-[#ca3431]' },
};

export function MoveList({ result, selectedPly, onSelectPly, exploreMoves, branchPly }: Props) {
  const { moves } = result;
  const hasBranch = !!exploreMoves?.length;

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
    <div className="divide-y divide-zinc-800/50">
      {/* Branch from start position (branchPly === null) */}
      {hasBranch && (branchPly === null || branchPly === 0) && (
        <ExploreBranch moves={exploreMoves!} />
      )}

      {pairs.map(({ moveNum, white, black }) => {
        const branchAfterWhite = hasBranch && branchPly === white.ply;
        const branchAfterBlack = hasBranch && black && branchPly === black.ply;

        return (
          <div key={moveNum}>
            <div className="grid grid-cols-[2rem_1fr_1fr] gap-x-3 px-4 py-1 text-sm">
              <span className="text-zinc-600 text-xs self-start pt-1">{moveNum}</span>
              <MoveColumn move={white} selected={selectedPly === white.ply} onSelect={onSelectPly} />
              {black
                ? <MoveColumn move={black} selected={selectedPly === black.ply} onSelect={onSelectPly} />
                : <span />}
            </div>

            {/* Branch after white's move in this pair */}
            {branchAfterWhite && <ExploreBranch moves={exploreMoves!} indentWhite />}

            {/* Branch after black's move in this pair */}
            {branchAfterBlack && <ExploreBranch moves={exploreMoves!} />}
          </div>
        );
      })}
    </div>
  );
}

function MoveColumn({
  move, selected, onSelect,
}: { move: MoveEval; selected: boolean; onSelect: (ply: number | null) => void }) {
  const cls = CLASSIFICATION_STYLE[move.classification];
  return (
    <div>
      <button
        onClick={() => onSelect(move.ply)}
        className={`w-full flex items-center justify-between min-w-0 rounded px-1 -mx-1 transition-colors cursor-pointer ${
          selected ? 'bg-zinc-700/60' : 'hover:bg-zinc-800/40'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0">
          <span className="font-mono">{move.san}</span>
          {cls.symbol && (
            <span className={`text-xs font-bold shrink-0 ${cls.className}`}>{cls.symbol}</span>
          )}
        </div>
        <span className={`text-xs font-mono shrink-0 ml-2 ${evalColor(move.eval)}`}>
          {formatEval(move.eval)}
        </span>
      </button>
      {move.alt_lines?.length > 0 && <AltLines lines={move.alt_lines} />}
    </div>
  );
}

function AltLines({ lines }: { lines: TopLine[] }) {
  return (
    <div className="pl-1 mt-0.5 mb-0.5">
      {lines.map((line, i) => (
        <span key={i} className="text-[11px] text-zinc-600 font-mono mr-2">
          ({line.san} {formatEval(line.eval)})
        </span>
      ))}
    </div>
  );
}

function ExploreBranch({ moves, indentWhite }: { moves: ExploreMoveData[]; indentWhite?: boolean }) {
  return (
    <div className={`px-4 py-1.5 border-l-2 border-zinc-700 ml-${indentWhite ? '10' : '4'} mr-4 mb-1 rounded-sm bg-zinc-900/40`}>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center">
        <span className="text-zinc-600 text-xs">↳</span>
        {moves.map((m, i) => {
          const cls = m.classification ? CLASSIFICATION_STYLE[m.classification] : null;
          return (
            <span key={i} className="flex items-center gap-0.5 font-mono text-xs">
              <span className="text-zinc-300">{m.san}</span>
              {cls?.symbol && (
                <span className={`text-[10px] font-bold ${cls.className}`}>{cls.symbol}</span>
              )}
            </span>
          );
        })}
        {moves[moves.length - 1]?.classification === null && (
          <span className="text-zinc-600 text-[10px]">evaluating…</span>
        )}
      </div>
    </div>
  );
}
