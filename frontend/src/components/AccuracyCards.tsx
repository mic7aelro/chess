'use client';

import { BookOpen, Check } from 'lucide-react';

// Solid filled thumbs-up matching Chess.com's "Excellent" icon style
function SolidThumbsUp({ size = 20, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg">
      <path d="M2 20h2c.55 0 1-.45 1-1v-9c0-.55-.45-1-1-1H2v11zm19.83-7.12c.11-.25.17-.52.17-.8V11c0-1.1-.9-2-2-2h-5.5l.92-4.65c.05-.22.02-.46-.08-.66-.23-.45-.52-.86-.88-1.22L14 2 7.59 8.41C7.21 8.79 7 9.3 7 9.83V18c0 1.1.9 2 2 2h9c.83 0 1.58-.51 1.83-1.22l3-7.12z"/>
    </svg>
  );
}
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

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; fill?: string; className?: string }>;

const ROWS: {
  key: Classification;
  label: string;
  symbol?: string;
  Icon?: IconComponent;
  iconSize?: number;
  iconFill?: boolean;
  strokeWidth?: number;
  symbolSize: string;
  symbolClass: string;
  badgeBg: string;
  badgeText: string;
}[] = [
  { key: 'brilliant',  label: 'Brilliant',  symbol: '!!', symbolSize: '22px', symbolClass: 'text-[#1fada8]', badgeBg: '#1fada8', badgeText: '#fff' },
  { key: 'great',      label: 'Great',      symbol: '!',  symbolSize: '26px', symbolClass: 'text-[#5c8fff]', badgeBg: '#5c8fff', badgeText: '#fff' },
  { key: 'book',       label: 'Book',       Icon: BookOpen,   iconSize: 20, symbolSize: '14px', symbolClass: 'text-[#a0784a]', badgeBg: '#7c4e28', badgeText: '#f5dfc0', strokeWidth: 1.5 },
  { key: 'best',       label: 'Best',       symbol: '★',  symbolSize: '32px', symbolClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  { key: 'excellent',  label: 'Excellent',  iconSize: 20, symbolSize: '14px', symbolClass: 'text-[#6fbc5b]', badgeBg: '#6fbc5b', badgeText: '#fff' },
  { key: 'good',       label: 'Good',       Icon: Check,      iconSize: 20, symbolSize: '13px', symbolClass: 'text-[#96bc4b]', badgeBg: '#96bc4b', badgeText: '#fff', strokeWidth: 3 },
  { key: 'inaccuracy', label: 'Inaccuracy', symbol: '?!', symbolSize: '18px', symbolClass: 'text-[#f4bf00]', badgeBg: '#f4bf00', badgeText: '#fff' },
  { key: 'mistake',    label: 'Mistake',    symbol: '?',  symbolSize: '22px', symbolClass: 'text-[#e07b2a]', badgeBg: '#e07b2a', badgeText: '#fff' },
  { key: 'miss',       label: 'Miss',       symbol: '⊘',  symbolSize: '26px', symbolClass: 'text-[#e05c2a]', badgeBg: '#e05c2a', badgeText: '#fff' },
  { key: 'blunder',    label: 'Blunder',    symbol: '??', symbolSize: '18px', symbolClass: 'text-[#ca3431]', badgeBg: '#ca3431', badgeText: '#fff' },
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
        {ROWS.map(({ key, label, symbol, Icon, iconSize, iconFill, strokeWidth, symbolSize, symbolClass, badgeBg, badgeText }) => {
          const wCount = wCounts[key] ?? 0;
          const bCount = bCounts[key] ?? 0;
          return (
            <div key={key} className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-2">
              {/* White count */}
              <span className={`text-base font-bold font-mono ${wCount > 0 ? symbolClass : 'text-white'}`}>
                {wCount}
              </span>
              {/* Colored circle badge with label below */}
              <div className="flex flex-col items-center px-6 min-w-[72px]">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center font-bold"
                  style={{ backgroundColor: badgeBg, color: badgeText, fontSize: symbolSize, lineHeight: 1 }}
                >
                  {key === 'excellent'
                    ? <SolidThumbsUp size={iconSize ?? 20} color={badgeText} />
                    : Icon
                    ? <Icon
                        size={iconSize ?? 14}
                        strokeWidth={strokeWidth ?? 2.5}
                        fill={'none'}
                      />
                    : (symbol === '?!' || symbol === '??' || symbol === '!!')
                    ? <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, gap: 0 }}>
                        {symbol.split('').map((ch, i) => (
                          <span key={i} style={{ fontWeight: 900, fontSize: symbolSize, lineHeight: 1, display: 'block', WebkitTextStroke: '0.5px currentColor' }}>{ch}</span>
                        ))}
                      </span>
                    : <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        fontWeight: 'bold',
                        marginTop: symbol === '★' ? '-2px' : symbol === '⊘' ? '-3px' : '0',
                        width: '100%',
                      }}>{symbol}</span>}
                </span>
                <span className="text-xs text-zinc-500 mt-1">{label}</span>
              </div>
              {/* Black count */}
              <span className={`text-base font-bold font-mono text-right ${bCount > 0 ? symbolClass : 'text-white'}`}>
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
