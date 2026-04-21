'use client';

import { evalBarWhiteUri, evalBarBlackUri } from '../lib/pieces';

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
  return 50 + (clamped / 500) * 45; // 5%–95%
}

function label(cp: number): string {
  if (cp >= 10000)  return 'M';
  if (cp <= -10000) return 'M';
  const pawns = Math.abs(cp) / 100;
  return (cp >= 0 ? '+' : '-') + pawns.toFixed(1);
}

export function EvalBar({ eval: cp, height = 400, orientation = 'white' }: Props) {
  const wpct  = whitePct(cp);   // percentage the white section takes up
  const bpct  = 100 - wpct;

  // When orientation = 'white' (normal): white player is at bottom of board
  //   → white section at BOTTOM of bar, black at TOP
  // When orientation = 'black' (flipped): black player is at bottom
  //   → white section at TOP of bar, black at BOTTOM
  const whiteAtBottom = orientation === 'white';

  const topPct    = whiteAtBottom ? bpct : wpct;
  const bottomPct = whiteAtBottom ? wpct : bpct;
  const topIsBlack = whiteAtBottom; // top section belongs to black when not flipped

  // Label placement:
  //   • White winning (cp ≥ 0): label in the white section near its "open" end
  //       – white at bottom → open end is top of white section = boundary → near top
  //       – white at top    → open end is very top of bar
  //   • Black winning (cp < 0): label in the black section near its "open" end
  //       – black at top    → open end is very top of bar
  //       – black at bottom → open end is very bottom of bar
  const whiteWinning = cp >= 0;
  const labelText = label(cp);

  let labelTop: string | undefined;
  let labelBottom: string | undefined;

  if (whiteAtBottom) {
    if (whiteWinning) {
      // White section grows from bottom; its top edge = boundary at bpct% from top
      // Place label just above boundary (in white section)
      labelTop = `${bpct}%`;
    } else {
      // Black winning; black fills from top → label near very top
      labelTop = '4px';
    }
  } else {
    // Flipped: white at top
    if (whiteWinning) {
      // White fills from top → label near very top
      labelTop = '4px';
    } else {
      // Black at bottom, winning → label near very bottom
      labelBottom = '4px';
    }
  }

  const labelInWhite = whiteWinning;

  // Color swatches rendered as <img> — iOS Safari dark-mode rewrites CSS
  // background-color even with color-scheme:only light, but leaves <img>
  // content alone.
  const topSrc    = topIsBlack ? evalBarBlackUri : evalBarWhiteUri;
  const bottomSrc = topIsBlack ? evalBarWhiteUri : evalBarBlackUri;

  const sectionStyle = (pct: number): React.CSSProperties => ({
    height: `${pct}%`,
    transition: 'height 600ms ease-in-out',
    position: 'relative',
    overflow: 'hidden',
  });
  const imgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    display: 'block',
    pointerEvents: 'none',
  };

  return (
    <div
      className="relative flex flex-col w-7 rounded overflow-hidden select-none shrink-0"
      style={{ height, colorScheme: 'light' } as React.CSSProperties}
    >
      {/* Top section */}
      <div style={sectionStyle(topPct)}>
        <img src={topSrc} alt="" aria-hidden draggable={false} style={imgStyle} />
      </div>
      {/* Bottom section */}
      <div style={sectionStyle(bottomPct)}>
        <img src={bottomSrc} alt="" aria-hidden draggable={false} style={imgStyle} />
      </div>

      {/* Floating label */}
      <div
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none"
        style={{
          top:    labelTop,
          bottom: labelBottom,
          transform: whiteAtBottom && whiteWinning ? 'translateY(-100%)' : undefined,
        }}
      >
        <span
          className="text-[11px] font-bold leading-none px-0.5 py-px"
          style={
            labelInWhite
              ? { color: '#3f3f46', backgroundColor: '#e4e4e7' }
              : { color: '#d4d4d8', backgroundColor: '#27272a' }
          }
        >
          {labelText}
        </span>
      </div>
    </div>
  );
}
