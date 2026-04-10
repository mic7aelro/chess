'use client';

import { useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceLine,
  ReferenceDot,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { MoveEval } from '@/types';

interface Props {
  moves: MoveEval[];
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
}

interface DataPoint {
  ply: number;
  label: string;
  eval: number;
  clampedEval: number;
}

function clamp(cp: number): number {
  return Math.max(-800, Math.min(800, cp));
}

function formatEval(cp: number): string {
  if (cp >= 10000) return '+M';
  if (cp <= -10000) return '-M';
  return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
}

// Left/right margin that Recharts applies inside the SVG (matches margin prop)
const CHART_MARGIN_LEFT  = 0;  // left: -20 shifts axis labels, but plot area starts ~0
const CHART_MARGIN_RIGHT = 4;

export function EvalGraph({ moves, selectedPly, onSelectPly }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const data: DataPoint[] = [
    { ply: 0, label: 'Start', eval: 0, clampedEval: 0 },
    ...moves.map((m) => ({
      ply: m.ply,
      label: `${Math.ceil(m.ply / 2)}. ${m.san}`,
      eval: m.eval,
      clampedEval: clamp(m.eval),
    })),
  ];

  function idxFromMouseX(clientX: number): number {
    if (!overlayRef.current) return 0;
    const rect = overlayRef.current.getBoundingClientRect();
    const usableWidth = rect.width - CHART_MARGIN_LEFT - CHART_MARGIN_RIGHT;
    const x = clientX - rect.left - CHART_MARGIN_LEFT;
    const ratio = Math.max(0, Math.min(1, x / usableWidth));
    return Math.round(ratio * (data.length - 1));
  }

  const hoverPoint = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="bg-[#141414] border border-zinc-800 rounded-lg p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-3">Evaluation</p>
      <div className="relative">
        <ResponsiveContainer width="100%" height={140}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: CHART_MARGIN_RIGHT, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="white-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#e4e4e7" stopOpacity={0.6} />
                <stop offset="95%" stopColor="#e4e4e7" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="black-grad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="5%" stopColor="#27272a" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#27272a" stopOpacity={0.1} />
              </linearGradient>
            </defs>

            <XAxis dataKey="ply" hide />
            <YAxis domain={[-800, 800]} hide />
            <ReferenceLine y={0} stroke="#3f3f46" strokeWidth={1} />

            {/* Selected ply marker */}
            {selectedPly !== null && (() => {
              const pt = data.find(d => d.ply === selectedPly);
              return pt ? (
                <>
                  <ReferenceLine x={selectedPly} stroke="#a1a1aa" strokeWidth={1} strokeDasharray="3 3" />
                  <ReferenceDot x={selectedPly} y={pt.clampedEval} r={4} fill="#fff" stroke="#a1a1aa" strokeWidth={1.5} />
                </>
              ) : null;
            })()}

            {/* Hover ply marker */}
            {hoverPoint && hoverPoint.ply !== selectedPly && (
              <ReferenceLine x={hoverPoint.ply} stroke="#71717a" strokeWidth={1} />
            )}

            {/* Suppress default Recharts tooltip — we render our own */}
            <Tooltip content={() => null} />

            <Area
              type="monotone"
              dataKey={(d: DataPoint) => (d.clampedEval >= 0 ? d.clampedEval : 0)}
              stroke="#e4e4e7"
              strokeWidth={1.5}
              fill="url(#white-grad)"
              isAnimationActive={false}
            />
            <Area
              type="monotone"
              dataKey={(d: DataPoint) => (d.clampedEval <= 0 ? d.clampedEval : 0)}
              stroke="#52525b"
              strokeWidth={1.5}
              fill="url(#black-grad)"
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Transparent overlay — owns all pointer events */}
        <div
          ref={overlayRef}
          className="absolute inset-0 cursor-pointer"
          onMouseMove={(e) => setHoverIdx(idxFromMouseX(e.clientX))}
          onMouseLeave={() => setHoverIdx(null)}
          onClick={(e) => {
            const idx = idxFromMouseX(e.clientX);
            const ply = data[idx]?.ply ?? null;
            onSelectPly(ply === 0 ? null : ply);
          }}
        />

        {/* Custom tooltip rendered above overlay */}
        {hoverPoint && (
          <div
            className="absolute top-1 pointer-events-none bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs z-10"
            style={{
              left: `${((hoverIdx! / (data.length - 1)) * 100).toFixed(1)}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="text-zinc-400">{hoverPoint.label}</p>
            <p className="text-white font-mono">{formatEval(hoverPoint.eval)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
