'use client';

import type { Classification, MoveEval, PlayerStats } from '@/types';

interface Props {
  whiteName: string;
  blackName: string;
  white: PlayerStats;
  black: PlayerStats;
  moves: MoveEval[];
}

type Counts = Partial<Record<Classification, number>>;

function countClassifications(moves: MoveEval[], side: 'white' | 'black'): Counts {
  const counts: Counts = {};
  for (const m of moves) {
    if (m.is_book) continue; // skip book moves
    if (side === 'white' ? m.ply % 2 !== 1 : m.ply % 2 !== 0) continue;
    counts[m.classification] = (counts[m.classification] ?? 0) + 1;
  }
  return counts;
}

const ROWS: {
  key: Classification;
  label: string;
  symbol: string;
  symbolClass: string; // colour for non-zero counts
  badgeBg: string;
  badgeText: string;
}[] = [
  { key: 'brilliant',  label: 'Brilliant',  symbol: '!!', symbolClass: 'text-[#1fada8]', badgeBg: '#1fada8', badgeText: '#fff' },
  { key: 'great',      label: 'Great',      symbol: '!',  symbolClass: 'text-[#5c8fff]', badgeBg: '#5c8fff', badgeText: '#fff' },
  { key: 'best',       label: 'Best',       symbol: '★',  symbolClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  { key: 'excellent',  label: 'Excellent',  symbol: '✓',  symbolClass: 'text-[#96bc4b]', badgeBg: '#96bc4b', badgeText: '#fff' },
  { key: 'good',       label: 'Good',       symbol: '●',  symbolClass: 'text-zinc-400',  badgeBg: '#6b7280', badgeText: '#fff' },
  { key: 'inaccuracy', label: 'Inaccuracy', symbol: '?!', symbolClass: 'text-[#f4bf00]', badgeBg: '#f4bf00', badgeText: '#000' },
  { key: 'mistake',    label: 'Mistake',    symbol: '?',  symbolClass: 'text-[#e07b2a]', badgeBg: '#e07b2a', badgeText: '#fff' },
  { key: 'miss',       label: 'Miss',       symbol: '⊘',  symbolClass: 'text-[#e05c2a]', badgeBg: '#e05c2a', badgeText: '#fff' },
  { key: 'blunder',    label: 'Blunder',    symbol: '??', symbolClass: 'text-[#ca3431]', badgeBg: '#ca3431', badgeText: '#fff' },
];

function resolveName(name: string, fallback: string): string {
  return name && name !== '?' ? name : fallback;
}

export function AccuracyCards({ whiteName, blackName, white, black, moves }: Props) {
  const wCounts = countClassifications(moves, 'white');
  const bCounts = countClassifications(moves, 'black');

  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-lg overflow-hidden text-sm">

      {/* Player names + accuracy */}
      <div className="grid grid-cols-[1fr_auto_1fr] px-6 py-4 border-b border-zinc-800">
        <div>
          <p className="font-semibold text-white truncate">{resolveName(whiteName, 'White')}</p>
          <p className="text-3xl font-bold mt-1 text-white">
            {white.accuracy.toFixed(1)}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">Accuracy</p>
        </div>
        <div className="self-center px-6 flex flex-col items-center gap-1">
          <div className="w-px h-8 bg-zinc-800" />
          <span className="text-xs text-zinc-600">vs</span>
          <div className="w-px h-8 bg-zinc-800" />
        </div>
        <div className="text-right">
          <p className="font-semibold text-white truncate">{resolveName(blackName, 'Black')}</p>
          <p className="text-3xl font-bold mt-1 text-white">
            {black.accuracy.toFixed(1)}
          </p>
          <p className="text-xs text-zinc-600 mt-0.5">Accuracy</p>
        </div>
      </div>

      {/* Classification rows */}
      <div className="divide-y divide-zinc-800/40">
        {ROWS.map(({ key, label, symbol, symbolClass, badgeBg, badgeText }) => {
          const wCount = wCounts[key] ?? 0;
          const bCount = bCounts[key] ?? 0;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-2">
              {/* White count */}
              <span className={`text-base font-bold font-mono ${wCount > 0 ? symbolClass : 'text-zinc-700'}`}>
                {wCount}
              </span>
              {/* Colored circle badge with label below */}
              <div className="flex flex-col items-center px-6 min-w-[72px]">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold"
                  style={{ backgroundColor: badgeBg, color: badgeText }}
                >
                  {symbol}
                </span>
                <span className="text-xs text-zinc-500 mt-1">{label}</span>
              </div>
              {/* Black count */}
              <span className={`text-base font-bold font-mono text-right ${bCount > 0 ? symbolClass : 'text-zinc-700'}`}>
                {bCount}
              </span>
            </div>
          );
        })}
      </div>

      {/* Game rating */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-4 border-t border-zinc-800">
        <p className="text-xl font-bold text-white">{white.elo}</p>
        <p className="text-xs text-zinc-600 uppercase tracking-widest px-6 text-center">Game Rating</p>
        <p className="text-xl font-bold text-white text-right">{black.elo}</p>
      </div>
    </div>
  );
}
