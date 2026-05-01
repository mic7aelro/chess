'use client';

interface Props {
  /** Centipawns from White's perspective. ±10000 = mate. */
  eval: number;
  height?: number;
  orientation?: 'white' | 'black';
}

function whitePct(cp: number): number {
  if (cp >= 10000) return 100;
  if (cp <= -10000) return 0;
  const clamped = Math.max(-500, Math.min(500, cp));
  return 50 + (clamped / 500) * 45;
}

function formatEval(cp: number): string {
  if (Math.abs(cp) >= 10000) return 'M';
  return (Math.abs(cp) / 100).toFixed(1);
}

export function EvalBar({ eval: cp, height = 400, orientation = 'white' }: Props) {
  const wpct = whitePct(cp);
  const bpct = 100 - wpct;

  const whiteAtBottom = orientation === 'white';
  const topPct    = whiteAtBottom ? bpct : wpct;
  const bottomPct = whiteAtBottom ? wpct : bpct;
  const topIsBlack = whiteAtBottom;

  const whiteWinning = cp >= 0;

  // Where the two sections meet, as % from top.
  // Clamped so the label stays visible even at extreme/mate evals.
  const boundaryPct = whiteAtBottom ? bpct : wpct;
  const b = Math.max(8, Math.min(92, boundaryPct));

  // Place label inside the WINNING section, near the boundary.
  let labelStyle: React.CSSProperties;
  if (whiteAtBottom) {
    if (whiteWinning) {
      // Winning = white (bottom). Anchor label just below boundary.
      labelStyle = { top: `calc(${b}% + 3px)` };
    } else {
      // Winning = black (top). Anchor label just above boundary.
      labelStyle = { bottom: `calc(${100 - b}% + 3px)` };
    }
  } else {
    if (whiteWinning) {
      // Black orientation, white wins. Winning = white (top). Just above boundary.
      labelStyle = { bottom: `calc(${100 - b}% + 3px)` };
    } else {
      // Black orientation, black wins. Winning = black (bottom). Just below boundary.
      labelStyle = { top: `calc(${b}% + 3px)` };
    }
  }

  // Text colour = losing side's colour (contrasts with the winning section background).
  const textColor = whiteWinning ? '#27272a' : '#e4e4e7';

  const sectionStyle = (pct: number, isBlack: boolean): React.CSSProperties => ({
    height: `${pct}%`,
    transition: `height var(--dur-fast) var(--ease-out)`,
    backgroundColor: isBlack ? '#27272a' : '#e4e4e7',
  });

  return (
    <div
      className="relative flex flex-col w-[22px] overflow-hidden select-none shrink-0"
      style={{ height, borderRadius: 'var(--r-sm) 0 0 var(--r-sm)', colorScheme: 'light' }}
    >
      <div style={sectionStyle(topPct, topIsBlack)} />
      <div style={sectionStyle(bottomPct, !topIsBlack)} />

      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
        style={labelStyle}
      >
        <span
          className="tnum text-[11px] font-bold leading-none"
          style={{ color: textColor }}
        >
          {formatEval(cp)}
        </span>
      </div>
    </div>
  );
}
