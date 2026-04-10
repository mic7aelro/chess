'use client';

interface Props {
  /** Centipawns from White's perspective. ±10000 = mate. */
  eval: number;
  height?: number;
}

function whitePct(cp: number): number {
  if (cp >= 10000) return 100;
  if (cp <= -10000) return 0;
  // Sigmoid-like mapping: clamp to ±500cp then scale
  const clamped = Math.max(-500, Math.min(500, cp));
  return 50 + (clamped / 500) * 45; // 5%–95%
}

function label(cp: number): string {
  if (cp >= 10000) return 'M';
  if (cp <= -10000) return 'M';
  const pawns = Math.abs(cp) / 100;
  return (cp >= 0 ? '+' : '-') + pawns.toFixed(1);
}

export function EvalBar({ eval: cp, height = 400 }: Props) {
  const pct = whitePct(cp);
  const blackPct = 100 - pct;

  return (
    <div className="flex flex-col w-6 rounded overflow-hidden select-none" style={{ height }}>
      {/* Black side */}
      <div
        className="bg-[#1a1a1a] flex items-start justify-center pt-1 transition-all duration-300"
        style={{ height: `${blackPct}%` }}
      >
        {blackPct > 55 && (
          <span className="text-[10px] font-bold text-zinc-300 leading-none">
            {cp < 0 ? label(cp) : ''}
          </span>
        )}
      </div>
      {/* White side */}
      <div
        className="bg-zinc-200 flex items-end justify-center pb-1 transition-all duration-300"
        style={{ height: `${pct}%` }}
      >
        {pct > 55 && (
          <span className="text-[10px] font-bold text-zinc-700 leading-none">
            {cp >= 0 ? label(cp) : ''}
          </span>
        )}
      </div>
    </div>
  );
}
