'use client';

import { ClassificationIcon, CLASSIFICATION_COLOR } from './ClassificationIcon';
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
    if (side === 'white' ? m.ply % 2 !== 1 : m.ply % 2 !== 0) continue;
    counts[m.classification] = (counts[m.classification] ?? 0) + 1;
  }
  return counts;
}

const ROWS: { key: Classification; label: string }[] = [
  { key: 'brilliant',  label: 'Brilliant'  },
  { key: 'great',      label: 'Great'      },
  { key: 'book',       label: 'Book'       },
  { key: 'best',       label: 'Best'       },
  { key: 'excellent',  label: 'Excellent'  },
  { key: 'good',       label: 'Good'       },
  { key: 'inaccuracy', label: 'Inaccuracy' },
  { key: 'mistake',    label: 'Mistake'    },
  { key: 'miss',       label: 'Miss'       },
  { key: 'blunder',    label: 'Blunder'    },
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
        {ROWS.map(({ key, label }) => {
          const wCount = wCounts[key] ?? 0;
          const bCount = bCounts[key] ?? 0;
          const color = CLASSIFICATION_COLOR[key];
          return (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-2">
              <span className="text-base font-bold font-mono" style={{ color: wCount > 0 ? color : 'white' }}>
                {wCount}
              </span>

              <div className="flex flex-col items-center px-6 min-w-[80px] gap-1">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  <ClassificationIcon classification={key} size={21} color="#fff" />
                </span>
                <span className="text-xs text-zinc-500">{label}</span>
              </div>

              <span className="text-base font-bold font-mono text-right" style={{ color: bCount > 0 ? color : 'white' }}>
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
