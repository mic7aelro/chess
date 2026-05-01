'use client';

import type { Classification } from '@/types';

interface IconProps {
  size?: number;
  color?: string;
}

// Filled lightning bolt — wider path, centered y:1.5–18.5, x:4–16
function Brilliant({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M12.5 1.5 L4 11 L9 11 L7.5 18.5 L16 9 L11 9 Z" />
    </svg>
  );
}

// Medal (circle + ribbon tails) — centered y:2–18
function Great({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M7.5 2 L5.5 8 L9 7 Z" />
      <path d="M12.5 2 L14.5 8 L11 7 Z" />
      <circle cx="10" cy="13" r="5" />
    </svg>
  );
}

// Open book — centered y:3.5–16.5
function Book({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 4 L4.5 3.5 Q3 3.5 3 5 L3 14.5 Q3 16 4.5 16 L10 16.5" />
      <path d="M10 4 L15.5 3.5 Q17 3.5 17 5 L17 14.5 Q17 16 15.5 16 L10 16.5" />
      <line x1="10" y1="4" x2="10" y2="16.5" />
    </svg>
  );
}

// Solid 5-pointed star — centered y:2–18
function Best({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <path d="M10 2 L12.35 7.65 L18.5 8.18 L14 12.14 L15.41 18.09 L10 15 L4.59 18.09 L6 12.14 L1.5 8.18 L7.65 7.65 Z" />
    </svg>
  );
}

// Double upward chevron — centered y:5–15
function Excellent({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15 L10 9.5 L15 15" />
      <path d="M5 10.5 L10 5 L15 10.5" />
    </svg>
  );
}

// Checkmark — centered y:5.5–15
function Good({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 L7.5 15 L17 5.5" />
    </svg>
  );
}

// Exclamation mark — stem y:2.5–11.5, dot cy:15, total y:2.5–16.7
function Inaccuracy({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill={color}>
      <rect x="8.6" y="2.5" width="2.8" height="9" rx="1.4" />
      <circle cx="10" cy="15" r="1.7" />
    </svg>
  );
}

// Question mark — arc y:3–12.5, dot cy:15.5, total y:3–17.1
function Mistake({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M7 7.5 C7 5 8.35 3 10 3 C11.65 3 13 5 13 7.5 C13 9.2 12 10 11 10.8 C10.5 11.2 10.2 11.8 10.2 12.5"
        stroke={color} strokeWidth="2.4" strokeLinecap="round"
      />
      <circle cx="10.2" cy="15.5" r="1.7" fill={color} />
    </svg>
  );
}

// Circle with horizontal bar — perfectly centered at (10,10)
function Miss({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <circle cx="10" cy="10" r="7" />
      <line x1="6.5" y1="10" x2="13.5" y2="10" />
    </svg>
  );
}

// Bold X — perfectly centered at (10,10)
function Blunder({ size = 20, color = 'currentColor' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round">
      <line x1="5" y1="5" x2="15" y2="15" />
      <line x1="15" y1="5" x2="5" y2="15" />
    </svg>
  );
}

const ICONS: Record<Classification, React.ComponentType<IconProps>> = {
  brilliant:  Brilliant,
  great:      Great,
  book:       Book,
  best:       Best,
  excellent:  Excellent,
  good:       Good,
  inaccuracy: Inaccuracy,
  mistake:    Mistake,
  miss:       Miss,
  blunder:    Blunder,
};

export const CLASSIFICATION_COLOR: Record<Classification, string> = {
  brilliant:  '#1fada8',
  great:      '#5c8fff',
  book:       '#a0784a',
  best:       '#6fbc5b',
  excellent:  '#6fbc5b',
  good:       '#96bc4b',
  inaccuracy: '#f4bf00',
  mistake:    '#e07b2a',
  miss:       '#e05c2a',
  blunder:    '#ca3431',
};

interface ClassificationIconProps {
  classification: Classification;
  size?: number;
  color?: string;
}

export function ClassificationIcon({ classification, size = 20, color }: ClassificationIconProps) {
  const Icon = ICONS[classification];
  const resolvedColor = color ?? CLASSIFICATION_COLOR[classification];
  return <Icon size={size} color={resolvedColor} />;
}
