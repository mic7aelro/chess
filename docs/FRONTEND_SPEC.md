# Mercury Chess — Frontend Specification

## 1. Project Overview

Mercury Chess is a single-page chess analysis application built with Next.js. It allows users to paste PGN/FEN, run engine analysis on a local backend, replay games move-by-move, explore alternative lines, and save analyses to a local library.

**Stack:** Next.js 16.2.3 · React 19 · TypeScript · Tailwind CSS v4  
**Backend:** `http://localhost:8000` (hardcoded)  
**Persistence:** localStorage only  
**Auth:** None

---

## 2. Project Structure

```
frontend/
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout, Geist font setup
│   │   ├── page.tsx          # Entire application (single page)
│   │   └── globals.css       # Tailwind imports + CSS variables
│   ├── components/
│   │   ├── AccuracyCards.tsx
│   │   ├── BoardPanel.tsx
│   │   ├── EngineLines.tsx
│   │   ├── EvalBar.tsx
│   │   ├── EvalGraph.tsx
│   │   ├── LibraryPanel.tsx
│   │   ├── MoveList.tsx
│   │   └── PgnInput.tsx      # Legacy; still present but replaced inline
│   ├── lib/
│   │   └── library.ts        # localStorage game management
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── eslint.config.mjs
├── next.config.ts            # Empty/minimal
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

---

## 3. TypeScript Types

**`/src/types/index.ts`**

```typescript
export type Classification =
  | 'book'
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export interface TopLine {
  san: string;       // First move in SAN
  moves: string[];   // Full principal variation (up to 17 SAN moves)
  eval: number;      // Centipawns from White's perspective
}

export interface MoveEval {
  ply: number;              // 1-based; odd = White, even = Black
  san: string;              // e.g. "e4", "Nf3", "O-O"
  from_sq: string;          // e.g. "e2"
  to_sq: string;            // e.g. "e4"
  eval: number;             // Centipawns after this move
  cp_loss: number;          // Centipawn loss vs best
  classification: Classification;
  is_book: boolean;
  opening_name?: string;
  opening_eco?: string;
  fen: string;              // Position FEN after move
  top_lines: TopLine[];     // Top 3 engine lines at ~depth 20
  alt_lines: TopLine[];
}

export interface PlayerStats {
  accuracy: number;   // 0–100
  elo: number;        // Estimated performance Elo
}

export interface AnalysisResult {
  headers: Record<string, string>; // PGN headers: White, Black, WhiteElo, BlackElo, Date, Event, Site, ECO, Opening…
  starting_fen: string;
  initial_lines: TopLine[];
  moves: MoveEval[];
  opening?: { name: string; eco: string };
  white: PlayerStats;
  black: PlayerStats;
}
```

**Additional types defined in `page.tsx`:**

```typescript
type PanelState = 'menu' | 'paste' | 'analysis' | 'freeplay' | 'play';

interface ExploreFrame {
  fen: string;
  from_sq: string;
  to_sq: string;
  evalCp: number;
  lines: TopLine[];
  san: string;
}

interface ExploreMoveData {
  san: string;
  classification: Classification | null;
}
```

---

## 4. Data Persistence — `lib/library.ts`

localStorage keys:
- `mercury_folders` → `SavedFolder[]`
- `mercury_reviews` → `SavedReview[]`

```typescript
interface SavedFolder {
  id: string;        // UUID
  name: string;
  createdAt: number; // Unix timestamp
}

interface SavedReview {
  id: string;
  folderId: string;
  name: string;
  pgn: string;
  white?: string;
  black?: string;
  date?: string;
  savedAt: number;
  result: AnalysisResult;
}
```

Exported functions:
```typescript
getFolders(): SavedFolder[]
getReviews(): SavedReview[]
createFolder(name: string): SavedFolder
saveReview(data: Omit<SavedReview, 'id' | 'savedAt'>): SavedReview
deleteReview(id: string): void
deleteFolder(id: string): void
renameFolder(id: string, name: string): void
renameReview(id: string, name: string): void
```

All functions guard against SSR with `typeof window === 'undefined'`.

---

## 5. API Calls

Base URL: `http://localhost:8000` (hardcoded, not in env)

### `POST /api/analysis/stream`
Full game analysis via Server-Sent Events.

**Request:**
```json
{ "pgn": "1. e4 c5 ..." }
```

**SSE Events:**
```json
{ "type": "progress", "analyzed": 4, "total": 40 }
{ "type": "complete", "result": { ...AnalysisResult } }
```

Implementation: `fetch()` → `response.body.getReader()` → `TextDecoder` → parse line-by-line.  
Called from: `handleAnalyse()`, `handleRerunFromLibrary()`

---

### `POST /api/analysis/eval`
Evaluate a single position.

**Request:**
```json
{ "fen": "...", "depth": 20 }
```

**Response:**
```json
{ "eval": 25, "top_lines": [...TopLine], "depth": 20 }
```

Called from: progressive deepening loop in explore/quickload mode. Iterates over depths `[8, 10, 12, 14, 16, 18, 20]` sequentially.

---

### `POST /api/analysis/best-move`
Get engine's best move (play mode).

**Request:**
```json
{ "fen": "...", "depth": 15 }
```

**Response:**
```json
{ "move": "e4", "san": "e4", "from_sq": "e2", "to_sq": "e4", "fen": "..." }
```

Called from: `enginePlayMove()` after the user moves in play mode.

---

### `POST /api/analysis/opening`
Detect opening name from FEN.

**Request:**
```json
{ "fen": "..." }
```

**Response:**
```json
{ "name": "Ruy López: Berlin Defense", "eco": "C65" }
```

Called from: useEffect in play mode, periodically as moves are made.

---

## 6. Page State Machine (`page.tsx`)

The app has a single page at `/`. All navigation is state-driven with no Next.js router usage.

### State Variables

```typescript
// Analysis
const [result, setResult] = useState<AnalysisResult | null>(null);
const [loading, setLoading] = useState(false);
const [analysisProgress, setAnalysisProgress] = useState<{ analyzed: number; total: number } | null>(null);
const [error, setError] = useState<string | null>(null);

// Navigation through moves
const [selectedPly, setSelectedPly] = useState<number | null>(null);
const [flipped, setFlipped] = useState(false);

// Which panel is shown
const [panelState, setPanelState] = useState<PanelState>('play');

// PGN input
const [pgn, setPgn] = useState('');

// Explore mode (user-played alternative lines)
const [exploreHistory, setExploreHistory] = useState<ExploreFrame[]>([]);
const [exploreIdx, setExploreIdx] = useState(-1);

// Quick-load tracking
const [isQuickLoaded, setIsQuickLoaded] = useState(false);

// Play mode
const [playThinking, setPlayThinking] = useState(false);
const [playOpening, setPlayOpening] = useState<{ name: string; eco: string } | null>(null);

// Eval bar
const [showEvalBar, setShowEvalBar] = useState(true);
const [evalBarCp, setEvalBarCp] = useState(0);

// Progressive deepening
const [deepLines, setDeepLines] = useState<TopLine[]>([]);
const [deepDepth, setDeepDepth] = useState<number | null>(null);
const deepFenRef = useRef<string>('');

// Animation
const [animatePieces, setAnimatePieces] = useState(false);

// Library
const [libraryOpen, setLibraryOpen] = useState(false);
const [saveModal, setSaveModal] = useState(false);
const [saveFolderId, setSaveFolderId] = useState('');
const [saveGameName, setSaveGameName] = useState('');
const [libraryRefresh, setLibraryRefresh] = useState(0);
```

### Panel State Transitions

```
play      → paste         (user clicks "Analysis" in sidebar)
paste     → analysis      (handleAnalyse completes)
paste     → analysis      (quick-load via "Load FEN/PGN")
analysis  → analysis      (explore: piece dropped on alternative move)
analysis  → paste         (user clicks "New" / goes back)
* (any)   → play          (user clicks "Play" in sidebar)
```

### Derived Display State

All board display values are computed on render (not stored):

- `isExploring` — `exploreIdx >= 0`
- `displayFen` — from `exploreHistory[exploreIdx]` if exploring, else from `result.moves[selectedPly]` or `result.starting_fen`
- `displayEval` — from explore deepening or result move eval
- `displayLines` — deep lines (explore) or move's `top_lines` (analysis)
- `displayLastMove` — `{ from_sq, to_sq }` of current move
- `displayIsWhiteToMove` — from chess.js turn on current FEN
- `gameMoveAtPly` — `result.moves[selectedPly - 1]`

### Navigation Functions

```typescript
navFirst()    // → selectedPly = null (start position)
navBack()     // → selectedPly - 1 (or exit explore)
navForward()  // → selectedPly + 1
navLast()     // → selectedPly = result.moves.length
exitExplore() // → exploreHistory = [], exploreIdx = -1
```

Keyboard bindings (useEffect on keydown):
- `ArrowLeft` → `navBack()`
- `ArrowRight` → `navForward()`
- `Escape` → `exitExplore()`

---

## 7. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Sidebar (w-52, sticky)  │  Board Area  │  Right Panel (w-1/4)  │
│  ─────────────────────── │  ──────────  │  ────────────────────  │
│  [Logo]                  │              │  (panelState = paste)  │
│                          │  [EvalBar]   │  ┌────────────────┐   │
│  [Play]                  │  [Board]     │  │ Textarea PGN   │   │
│  [Analysis]              │  [EngineLines│  │ [Analyse]      │   │
│  [Library]               │   (below)]  │  │ [Load FEN/PGN] │   │
│                          │              │  └────────────────┘   │
│  [Flip board]            │              │                        │
│  [Toggle eval bar]       │              │  (panelState = analysis│
│                          │              │  ┌────────────────┐   │
│                          │              │  │ EvalGraph      │   │
│                          │              │  │ MoveList       │   │
│                          │              │  │ AccuracyCards  │   │
│                          │              │  │ [Save/New btns]│   │
│                          │              │  └────────────────┘   │
│                          │              │                        │
│                          │              │  (panelState = play)   │
│                          │              │  ┌────────────────┐   │
│                          │              │  │ Opening name   │   │
│                          │              │  │ [New Game btn] │   │
│                          │              │  └────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

When `libraryOpen = true`, a 256px wide library panel slides in from the left (inside the sidebar). Board area shrinks accordingly.

---

## 8. Components

### `BoardPanel.tsx`

Interactive chessboard with legal move indicators, last-move highlights, right-click highlights, and an optional eval bar.

**Props:**
```typescript
{
  fen: string;
  lastMove: { from: string; to: string } | null;
  evalCp: number;
  orientation: 'white' | 'black';
  onPieceDrop: (from: string, to: string) => boolean;
  size?: number;           // default 400
  badge?: React.ReactNode; // overlay badge on destination square
  showEvalBar?: boolean;   // default true
  animatePieces?: boolean;
}
```

**Behavior:**
- Dynamically imported (`dynamic(() => import('react-chessboard'), { ssr: false })`)
- `chess.js` instance created from `fen` on each render
- Click-to-move: click source → highlight legal targets → click target → call `onPieceDrop`
- Drag-and-drop move with promotion defaulting to queen
- Right-click toggles red highlight on that square
- Last-move squares highlighted in yellow-green (`rgba(255,255,0,0.4)`)
- Selected square highlighted in yellow (`rgba(255,255,0,0.6)`)
- Legal move dots on empty target squares, capture rings on occupied squares
- Board colors: dark `#769656`, light `#eeeed2`
- Eval bar rendered to the left of the board when `showEvalBar && evalCp !== undefined`

---

### `EvalBar.tsx`

Vertical two-color bar showing White/Black advantage.

**Props:**
```typescript
{
  eval: number;               // centipawns
  height?: number;            // px, default 400
  orientation?: 'white' | 'black';
}
```

**Behavior:**
- White portion = top, black portion = bottom (flipped when orientation = 'black')
- Display clamped to ±500cp; visual range 5%–95%
- Floating label: `+2.5`, `-1.3`, `M#5`, `M#-3`
- Label color changes between black/white based on its position in the bar
- 300ms CSS transition on bar heights

**Helper functions:**
```typescript
function whitePct(cp: number): number   // → percentage 5–95
function label(cp: number): string      // → formatted string
```

---

### `EngineLines.tsx`

Displays top engine principal variations with eval badges.

**Props:**
```typescript
{
  lines: TopLine[];
  isWhiteToMove: boolean;
  depth?: number;    // undefined → show "searching…"
}
```

**Behavior:**
- Shows up to 3 lines
- Each line: `[eval badge] [move sequence]`
- Eval badge: white background + black text for White advantage, dark background + white text for Black advantage
- Piece icons (SVG) prefix piece-moving moves (N, B, R, Q, K)
- Dynamic truncation: lines clipped to fit panel width, with ▼/▲ expand toggle
- Width measured via hidden ref div
- Shows `depth: N` when `depth` is defined; `searching…` when undefined

**Helper functions:**
```typescript
function formatEval(cp: number): string
function evalBadgeClass(cp: number): string    // Tailwind class
function PieceIcon({ san, isWhite, size }): React.ReactNode
function MoveToken({ san, isWhite }): React.ReactNode
```

---

### `EvalGraph.tsx`

Area chart of evaluation over the course of a game.

**Props:**
```typescript
{
  moves: MoveEval[];
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
}
```

**Behavior:**
- Recharts `AreaChart` with two overlapping areas: one clipped to y≥0 (white), one to y≤0 (black)
- Y-axis clamped to ±800cp for display; actual values shown in tooltip
- Reference line at y=0
- Click on chart → calls `onSelectPly(ply)`
- Hover shows custom tooltip (Recharts default tooltip suppressed) with move number + formatted eval
- Selected ply: dashed vertical reference line + dot
- No animations

**Helper functions:**
```typescript
function clamp(cp: number): number       // ±800
function formatEval(cp: number): string
function idxFromMouseX(clientX: number): number
```

---

### `MoveList.tsx`

Scrollable list of moves paired by number, with classification badges and eval.

**Props:**
```typescript
{
  result: AnalysisResult;
  selectedPly: number | null;
  onSelectPly: (ply: number | null) => void;
  exploreMoves?: ExploreMoveData[];  // alternative branch moves
  branchPly?: number | null;
  showEval?: boolean;
}
```

**Behavior:**
- Paired rows: `[move number] [white move] [black move]`
- Each move cell: classification badge symbol + SAN + eval
- Classification symbols shown: `★` (brilliant), `!!` (great), `!` (book, excellent, best), `?!` (inaccuracy), `?` (mistake), `??` (blunder)
- Eval displayed right-aligned; color scaled from green (high) to gray (low)
- Active move highlighted with white background / black text
- Explore branch appended below main moves with visual indent and different styling
- Auto-scroll to active move (useEffect on selectedPly)
- Click on move → `onSelectPly(ply)`

**Helper functions:**
```typescript
function formatEval(cp: number): string
function evalColor(cp: number): string    // Tailwind text-color class
```

---

### `AccuracyCards.tsx`

Per-player stats summary shown at the bottom of analysis panel.

**Props:**
```typescript
{
  whiteName: string;
  blackName: string;
  white: PlayerStats;
  black: PlayerStats;
  moves: MoveEval[];
}
```

**Behavior:**
- Side-by-side cards for White and Black
- Accuracy percentage in large font (text-3xl)
- Estimated Elo display
- Per-classification move counts (only non-zero counts shown)
- Classification color badges matching Chess.com palette
- "Excellent" moves shown with solid thumbs-up icon instead of text

**Classification colors (hex):**
```
brilliant:  #1fada8
great:      #5c8fff
book:       #7c4e28
best:       #6fbc5b
excellent:  #6fbc5b  (+ thumbs-up icon)
good:       #96bc4b
inaccuracy: #f4bf00
mistake:    #e07b2a
miss:       #e05c2a
blunder:    #ca3431
```

**Helper functions:**
```typescript
function countClassifications(moves: MoveEval[], side: 'white' | 'black'): Record<Classification, number>
function resolveName(name: string, fallback: string): string
```

---

### `LibraryPanel.tsx`

Folder/review tree panel for saved analyses.

**Props:**
```typescript
{
  onLoad: (pgn: string, result: AnalysisResult) => void;
  onRerun: (pgn: string) => void;
  refreshKey: number;
}
```

**Behavior:**
- Reads `getFolders()` and `getReviews()` on mount and on `refreshKey` change
- Folders listed with expand/collapse (ChevronDown / ChevronRight icons)
- "Unsorted" section at bottom for reviews with no folder
- Create folder: button → inline input → Enter or [Add] to commit, Esc to cancel
- Right-click on review row → context menu popup at click coordinates
  - Rename → inline input replacing row text; Enter/blur to commit, Esc to cancel
  - Re-run → calls `onRerun(review.pgn)`
  - Delete → confirmation dialog → `deleteReview(id)` → refresh
- Delete folder: (assumed via context menu) → confirmation → `deleteFolder(id)` → refresh
- Reviews sorted by `savedAt` descending within each folder
- Date shown as locale date string

**Sub-components (defined inline):**
- `ReviewRow` — Single review list item with rename support
- `ContextMenuPopup` — Fixed-position right-click menu; closes on outside click
- `ConfirmationDialog` — Modal with Confirm/Cancel buttons

---

### `PgnInput.tsx` (Legacy)

Simple textarea + analyze button. Still present but replaced by inline code in `page.tsx`.

**Props:**
```typescript
{
  onAnalyse: (pgn: string) => void;
  loading: boolean;
}
```

---

## 9. Forms

### PGN/FEN Input (Paste Panel)

```
Label: "Analyze FEN / PGN"
Textarea:
  - Placeholder: "Paste PGN or FEN here…"
  - Font: monospace
  - Height: h-52
  - Non-resizable
  - Focus: border-zinc-400

Buttons (stacked):
  1. "Analyse"       (white, full-width)
     - Disabled: pgn.trim() === '' || loading
     - On click: handleAnalyse()

  2. "Load FEN / PGN" (outline, secondary)
     - Disabled: pgn.trim() === ''
     - On click: handleQuickLoad()
```

**Validation logic:**
- FEN detection: `text.split(' ').length >= 6 && text.split(' ')[0].split('/').length === 8`
- FEN validation: `new Chess(fen)` — throws on invalid FEN
- PGN validation: `chess.loadPgn(pgn)` + check `chess.history().length > 0`
- Error display: red text below buttons

---

### Save to Library Modal

Shown when user clicks "Save" in analysis panel. Absolute centered overlay.

```
Title: "Save to Library"

Field 1 — Game name:
  Input (text)
  Default value: "{White} vs {Black}" from PGN headers

Field 2 — Folder:
  Select (dropdown) populated from getFolders()
  If no folders: show "No folders yet — create one below" message

Inline folder creation:
  Input (text) placeholder "New folder name…"
  [Create] button → createFolder(name) → refresh dropdown

Buttons:
  [Cancel]  → setSaveModal(false)
  [Save]    → saveReview(...) → setSaveModal(false) → setLibraryRefresh(n+1)
              Disabled if saveFolderId === ''
```

---

### New Folder (Library Panel)

```
Appears when creatingFolder = true:
  Input placeholder "Folder name…"
  [Add] button
  Keyboard: Enter → submit, Esc → cancel
```

### Review Rename (Library Panel)

```
Inline input replacing review row text:
  Pre-filled with current review name
  Keyboard: Enter / blur → commit (renameReview), Esc → cancel
```

---

## 10. Algorithms

### Move Classification

Uses win-probability model:

```typescript
function cpToWinProb(cp: number): number {
  if (cp >= 10000) return 1;
  if (cp <= -10000) return 0;
  return 1 / (1 + Math.pow(10, -cp / 400));
}

function classifyMove(scoreBefore: number, scoreAfter: number): Classification {
  const loss = Math.max(0, cpToWinProb(scoreBefore) - cpToWinProb(scoreAfter));
  if (loss < 0.005) return 'best';
  if (loss < 0.02)  return 'excellent';
  if (loss < 0.05)  return 'good';
  if (loss < 0.10)  return 'inaccuracy';
  if (loss < 0.20)  return 'mistake';
  return 'blunder';
}
```

### Progressive Deepening (Explore / Quick-load Mode)

```
Condition: isExploring || isQuickLoaded

1. On FEN change (useEffect dependency):
   - Record current FEN in deepFenRef
   - Set deepLines = [], deepDepth = null
   - For depth in [8, 10, 12, 14, 16, 18, 20]:
       if (cancelled || deepFenRef.current !== currentFen) break
       fetch POST /api/analysis/eval { fen, depth }
       setDeepLines(result.top_lines)
       setDeepDepth(result.depth)

2. Cleanup: set cancelled = true on unmount or FEN change
```

### Eval Bar Debouncing (Play Mode)

```
Non-play: evalBarCp = displayEval (immediate)
Play mode:
  - Watch deepLines + deepDepth in useEffect
  - Only update evalBarCp if deepDepth >= 12
  - Debounce: setTimeout 900ms before applying
  - Clear timeout on FEN change to prevent stale updates
```

### Board Size Calculation

```typescript
function useBoardSize(panelOpen: boolean): number {
  // On mount and resize:
  const SIDEBAR_W = 208;                  // w-52
  const LIBRARY_W = panelOpen ? 256 : 0;  // w-64 when open
  const RIGHT_PANEL_W = window.innerWidth * 0.25; // w-1/4
  const PADDING = 48;
  const available_w = window.innerWidth - SIDEBAR_W - LIBRARY_W - RIGHT_PANEL_W - PADDING;
  const available_h = window.innerHeight - 160;
  return Math.floor(Math.min(available_w, available_h));
}
```

### Explore History Management

```
User drops piece on board in analysis or freeplay mode:
  1. Create ExploreFrame: { fen, from_sq, to_sq, evalCp, lines, san }
  2. If exploreIdx < exploreHistory.length - 1:
       Truncate history to exploreIdx + 1 (discard future)
  3. Append new frame
  4. exploreIdx = exploreHistory.length - 1 (after append)

navBack() in explore:
  If exploreIdx > 0: exploreIdx -= 1
  If exploreIdx === 0: exitExplore()

exitExplore():
  setExploreHistory([])
  setExploreIdx(-1)
```

---

## 11. Dependencies

```json
{
  "dependencies": {
    "@tanstack/react-query": "^5.97.0",   // installed, not used
    "chess.js": "^1.4.0",
    "lucide-react": "^1.8.0",
    "next": "16.2.3",
    "react": "19.2.4",
    "react-chessboard": "^5.10.0",
    "react-dom": "19.2.4",
    "recharts": "^3.8.1"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.2.3",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

**chess.js usage:**
- `new Chess(fen)` — validate FEN, get legal moves
- `chess.moves({ square, verbose: true })` — legal moves from a square
- `chess.move({ from, to, promotion: 'q' })` — execute move
- `chess.loadPgn(pgn)` — parse PGN
- `chess.history({ verbose: true })` — get move list
- `chess.fen()` — get current FEN
- `chess.turn()` — `'w'` or `'b'`
- `chess.isGameOver()` — end detection

**react-chessboard usage:**
- `dynamic(() => import('react-chessboard'), { ssr: false })`
- Props: `position`, `boardOrientation`, `customSquareStyles`, `onPieceDrop`, `onSquareClick`, `onSquareRightClick`, `animationDuration`

**recharts usage:**
- `AreaChart`, `Area`, `XAxis`, `YAxis`, `ReferenceLine`, `ReferenceDot`, `Tooltip`, `ResponsiveContainer`

**lucide-react icons used:**
- `BookOpen`, `Check`, `Library`, `SkipBack`, `SkipForward`, `ChevronLeft`, `ChevronRight`, `Swords`, `Plus`, `Folder`, `FolderOpen`, `ChevronDown`, `ChevronRight`

---

## 12. Styling

**Framework:** Tailwind CSS v4 via `@tailwindcss/postcss`

**Theme:** Dark mode only. No light mode toggle.

**Fonts:**
- `Geist` (sans-serif) — CSS var `--font-geist-sans`
- `Geist Mono` (monospace) — CSS var `--font-geist-mono`

**Board colors:**
- Dark squares: `#769656`
- Light squares: `#eeeed2`
- Last-move highlight: `rgba(255,255,0,0.4)`
- Selected square: `rgba(255,255,0,0.6)`
- Legal move dot: `rgba(0,0,0,0.15)`
- Legal capture ring: `rgba(0,0,0,0.15)` (outline circle)
- Right-click highlight: `rgba(200,0,0,0.4)`

**Primary palette:** `zinc-*` scale on a pure black (`#000`) background.

**Classification badge colors:**
```
brilliant:  #1fada8  (teal)
great:      #5c8fff  (blue)
book:       #7c4e28  (brown)
best:       #6fbc5b  (green)
excellent:  #6fbc5b  (green, with thumbs-up icon)
good:       #96bc4b  (light green)
inaccuracy: #f4bf00  (yellow)
mistake:    #e07b2a  (orange)
miss:       #e05c2a  (dark orange)
blunder:    #ca3431  (red)
```

---

## 13. Config Files

### `next.config.ts`
```typescript
import type { NextConfig } from "next";
const nextConfig: NextConfig = {};
export default nextConfig;
```

### `tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

### `postcss.config.mjs`
```javascript
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

### `eslint.config.mjs`
```javascript
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
```

---

## 14. Known Limitations

| # | Issue |
|---|-------|
| 1 | Backend URL hardcoded to `http://localhost:8000` — no env var |
| 2 | No authentication or user accounts |
| 3 | Library stored in localStorage (~5MB limit) |
| 4 | Zustand installed but unused; all state is local to components |
| 5 | @tanstack/react-query installed but unused |
| 6 | Piece promotion always defaults to queen; no promotion dialog |
| 7 | No error boundary; uncaught errors reach the browser |
| 8 | Board size calculation uses hardcoded sidebar/library/panel px values |
| 9 | No offline/PWA support |
| 10 | No undo/redo within explore mode; history is forward-only |
