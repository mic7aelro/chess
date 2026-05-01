# Mercury Chess — Frontend Redesign Plan

**Goal:** make the UI feel *modern* and *snappy*. Modern = a clear visual identity (typography, spacing, motion), not a Chess.com clone. Snappy = sub‑frame interactions, no jank, optimistic state, no stale closures.

This plan is grounded in the current code (Next 16.2.3, React 19, Tailwind 4, Zustand, react-chessboard 5.10). File:line callouts reference real issues found in the audit.

---

## 1. Design System

We don't have one. Colors, fonts, spacing, and radii are scattered as hex literals across 4+ files. Step one is to centralize.

### 1.1 Tokens (`globals.css`)
Replace the current 9-line `:root` with a token layer:

- **Surfaces** — `--bg-0:#08090b`, `--bg-1:#101216`, `--bg-2:#181b21`, `--bg-3:#22262e`
- **Text** — `--fg-0:#f5f6f8`, `--fg-1:#b6bac3`, `--fg-2:#7a808c`, `--fg-3:#4a505b`
- **Accent** — `--accent:#7c93ff` (cool indigo, replaces zinc-only palette), `--accent-soft:#7c93ff22`
- **Border** — `--line:#ffffff0d`, `--line-strong:#ffffff14` (alpha borders read better on near-black than `border-zinc-800`)
- **Classification** — promote the `classBg`/`classGlow` map (page.tsx:51‑61, AccuracyCards.tsx:38‑47) to CSS vars (`--c-brilliant`, `--c-great`, …) so a single edit re-tints chart, badges, move list, and eval bar in unison.
- **Radii** — `--r-sm:6px`, `--r-md:10px`, `--r-lg:14px`, `--r-xl:20px`. Currently a mix of `rounded-md`/`rounded-xl` with no rule.
- **Shadows** — `--shadow-1: 0 1px 0 #ffffff0a inset, 0 8px 24px -12px #000`. One elevation, used on the right panel and modals.
- **Motion** — `--ease-out:cubic-bezier(.2,.8,.2,1)`, `--ease-spring:cubic-bezier(.34,1.56,.64,1)`, `--dur-fast:120ms`, `--dur:180ms`, `--dur-slow:280ms`.

Expose these to Tailwind 4 via `@theme inline` so we can write `bg-bg-1`, `text-fg-1`, `ring-accent` instead of `bg-[#141414]`.

### 1.2 Typography
`globals.css:21` falls back to `Arial, Helvetica` despite Geist being referenced — Geist is never actually imported. Wire it up properly via `next/font/local` (or `next/font/google` if available in 16.2.3 — confirm in `node_modules/next/dist/docs/`).

- **Display:** Geist Sans, tight tracking (`-0.02em`) for `h1`/score numbers
- **Body:** Geist Sans, default tracking
- **Mono:** Geist Mono for evals (`+1.24`), SAN, depth (`d18`)
- **Numerics:** `font-feature-settings: 'tnum','ss01'` everywhere a number sits next to text — eliminates the "wobbling eval" look as numbers tick.

### 1.3 Iconography
We're on `lucide-react@^1.8.0` (very old). Bump to current. Standardize on 16px stroke‑1.5 inline icons, 18px in nav. Today the nav icons mix sizes.

---

## 2. Layout & Information Architecture

The current layout uses three sticky vertical strips (sidebar 208 + library 256 + board + right panel ~25%) computed by hand at page.tsx:67‑89. This is fragile — every panel state recomputes board size, and the calculations live in the parent component.

### 2.1 New shell
- **Top bar** (h‑12) — logo, breadcrumb (`Library / Folder / Game`), global actions (theme toggle removed — light mode isn't a real product, drop the `color-scheme: only light` hack and own dark fully).
- **Left rail** (w‑14, icon‑only) — Menu, Library, Repertoire, Play, Settings. Tooltips on hover. This shrinks the current 208px sidebar by ~70% and gives the board more room.
- **Workspace** — single resizable two-pane: board (left), context panel (right). The current "library slides in as a third column" pattern is dropped; library becomes a full overlay drawer with a backdrop blur. Saves 256px of permanent chrome.
- **Repertoire** stays full‑width but rendered inside the workspace (no more `panelState === 'repertoire'` hiding the board entirely).

### 2.2 Board sizing
Move the size math out of `page.tsx`. Use a `ResizeObserver` on the workspace element and pass `boardSize` via context — no more dependency on `panelState` to know how wide to render. Eliminates the visible reflow when switching menu→analysis.

### 2.3 State decomposition
`page.tsx` is a 1846‑line component with 40+ `useState`s. Split into Zustand slices (already a dep):

- `useReviewStore` — `result`, `selectedPly`, `exploreStack`, `deepLines`
- `usePlayStore` — `playState`, color, skill, clock
- `useUIStore` — `panelState`, library open, modal stack, toasts

This kills the cascade re-render that today fires on every keypress (page.tsx:819‑826 has a `handleKey` with stale-closure ESLint disable — Zustand selectors fix this for free).

---

## 3. Motion System

There is essentially no motion today: `transition-colors` here, a 600ms eval-bar height there, `animate-pulse` on the engine status (page.tsx:1085). Recharts even has `isAnimationActive={false}` (EvalGraph.tsx:117). This is the single biggest "feels old" signal.

### 3.1 Add `motion` (Framer Motion's successor, ~12kb)
- **Panel transitions** — workspace right panel cross‑fades + 8px slide on `panelState` change (`AnimatePresence` with `mode="popLayout"`).
- **Move list** — when a move classification arrives during streaming SSE, the badge pops in with a `--ease-spring` scale 0.8→1. Today badges just appear.
- **Eval graph** — re-enable Recharts animation but cap at 200ms; tween between frames during streaming so the curve grows live instead of jumping.
- **Library drawer** — slide + backdrop blur instead of the current 200ms width transition (page.tsx:989) which causes the workspace to reflow mid-animation.
- **Modals** (Save, Confirm) — scale 0.96→1 + fade, focus trap, Esc handler. Today they appear instantly with no entrance.

### 3.2 View Transitions API
Next 16 supports the View Transitions API. Use it for:
- Library row → analysis screen (board zooms from row thumbnail to full size)
- Freeplay → Review (eval bar fades in beside the board you've been playing on)

Consult `node_modules/next/dist/docs/01-app/` for the exact API before implementing — Next 16 reportedly differs from training data.

### 3.3 Board feedback
- **Last move** — animated pulsing ring (1 cycle) on the destination square, not just a static yellow tint
- **Classification ping** — when a move is classified, the corresponding square emits a soft `--c-blunder`/`--c-brilliant` glow that decays over 600ms
- **Drag** — increase `animatePieces` to a spring, raise piece slightly with shadow on grab
- **Promotion** — current dialog is jarring; replace with an in‑square overlay (4 piece options scaling in around the pawn).

---

## 4. Snappiness — Concrete Wins

### 4.1 Re-render scope
- **MoveList.tsx:75‑82** — `pairs` rebuilt every parent render. `useMemo([moves])`.
- **EvalGraph.tsx:47‑55** — `data` array rebuilt every render. `useMemo`.
- **EngineLines.tsx:154** — list maps without memo; expanding one row re-renders all. Extract `<EngineLineRow>` and `React.memo` it.
- **BoardPanel.tsx:87‑110** — `squareStyles` rebuilt every render even when no highlight changed. `useMemo([selectedSquare, highlights, lastMove])`.
- **LibraryPanel.tsx:173‑215** — recursive `ReviewRow` defined inline; remount on every parent state change. Hoist + memo.

### 4.2 Stale closures
- **page.tsx:819‑826** — `handleKey` has `// eslint-disable-next-line react-hooks/exhaustive-deps` and captures stale `result`/`exploreIdx`. Fix by reading from Zustand inside the handler (`useReviewStore.getState().selectedPly`).
- **page.tsx:838‑877** — progressive deepening effect has a `deepFenRef` workaround for missing deps. Replace with a proper ref-driven async loop guarded by an abort signal.

### 4.3 Long lists
- **MoveList** at 100+ ply: render flat (no virtualization needed at 100 rows) but `content-visibility: auto` on each row gives the browser permission to skip offscreen layout. Free 1‑2ms per scroll frame.
- **RepertoirePanel.tsx:54‑86** — `buildTree` recurses to depth 30 with no cycle detection. Add a visited‑set; large repertoires currently freeze.
- **LibraryPanel** folders + games — virtualize with `@tanstack/react-virtual` if a folder has > 50 games. Today it's a flat map.

### 4.4 Network
- Move SSE state into React Query (already installed) with `useStreamingMutation` pattern. Gives us automatic dedupe, retry, optimistic save.
- Prefetch eval for ply ±1 when user hovers the move list — by the time they click, lines are already populated (currently visible 200‑500ms blank state).
- Cache `/api/analysis/eval` responses keyed by `fen+depth` in a Map (LRU 200 entries). Re-visiting a position should be 0ms.

### 4.5 Bundle
- `recharts@3.8` is heavy (~95kb). Lazy import EvalGraph behind `next/dynamic` — it's only needed in the analysis state.
- `react-chessboard@5.10` already lazy via `dynamic()`. Add a skeleton placeholder so the first paint shows the board frame instantly.
- Drop the `<img>` board background workaround (BoardPanel.tsx:119‑133) and `<img>` eval bar (EvalBar.tsx:75‑79) once we own dark mode — single CSS gradient, ~30 fewer DOM nodes.

---

## 5. Component‑Level Refresh

| Component | Current pain | Redesign |
|---|---|---|
| `BoardPanel` | iOS img workaround; static highlights | CSS-only board (we control color-scheme); animated last-move ring; classification pulse on the destination square |
| `EvalBar` | 600ms ease-in-out height jump (EvalBar.tsx:83); img-based gradient | Spring tween on eval delta; thin centered tick line; mate text inside the bar with mono font |
| `EngineLines` | Each row re-renders on toggle; depth shown as plain text | Memoized rows; depth as a small mono pill (`d 18`); SAN with piece glyphs at fixed advance width so lines align |
| `EvalGraph` | Animation disabled; click-to-navigate but no hover scrub | Re-enable animation; scrubbable cursor that previews the position on the board on hover (no commit until click) |
| `MoveList` | Pairs rebuilt every render; classification badge appears flat | Memoized pairs; badge spring-in on classify; current ply has an animated indicator bar on the left edge |
| `AccuracyCards` | `text-3xl` numeric without tnum; static | Animated count-up on result arrival (200ms), tnum, sparkline of the per-side WP curve under the number |
| `LibraryPanel` | Slides in as a third column, reflows workspace | Full-height drawer with backdrop blur; Cmd+K to open; type-to-filter |
| `PgnInput` | 31 lines, plain textarea | Drop‑zone for `.pgn` files; auto-detect FEN vs PGN; "Try a sample game" link |
| `RepertoirePanel` | 849 lines, monolithic | Split into `TreeView`, `DrillRunner`, `OpeningHeader`; add cycle detection; collapse/expand animations |

---

## 6. New Surfaces

- **Command palette (`⌘K`)** — open library, jump to ply, change skill, "Analyse current FEN", "Copy PGN". Single component (~200 lines). Dramatically improves perceived speed because power users never touch the mouse.
- **Toast system** — replace `alert()` calls (currently used in error paths) with a stacked toast in the bottom-right.
- **Progress on analyse** — the existing progress bar is fine, but add a per-stage label (`Analysing move 14/40 · depth 18`) and a shimmer instead of a flat fill. Currently page.tsx shows just a percentage.
- **Skeleton states** — every panel currently flashes empty before populating. Add skeleton blocks (board frame, 6 move-list rows, 2 engine lines) shown for the first ~150ms of any data fetch.

---

## 7. Phased Rollout

We don't ship this in one PR. Each phase is independently mergeable.

1. **Tokens & typography** (0.5 day) — globals.css + Tailwind theme + Geist wired up. Visual diff but no behavior change. Ship behind no flag.
2. **State split** (1 day) — page.tsx → Zustand slices. Pure refactor; no UI change. Unblocks the rest.
3. **Component memo pass** (0.5 day) — the §4.1 list. Measurable before/after via React DevTools profiler.
4. **Layout shell** (1 day) — left rail, library drawer, ResizeObserver-driven board sizing.
5. **Motion pass** (1.5 days) — `motion` integration, panel transitions, move-classification pings, eval-graph live tween.
6. **Component refresh** (2 days) — table in §5, one component per commit.
7. **Command palette + toasts** (0.5 day).
8. **Polish** (1 day) — skeletons, microcopy, empty states, focus rings, reduced-motion media query.

Total ≈ 8 working days, parallelizable to ~5 with two contributors.

---

## 8. Non-goals

- **Light mode** — drop it. The `color-scheme: only light` line in globals.css is fighting iOS Safari for a feature we don't use. Own dark mode fully.
- **Mobile-first redesign** — current mobile layout is OK. Ship the desktop redesign first; mobile gets the new tokens for free and a follow-up sweep.
- **Replacing react-chessboard** — it works. Don't rewrite the board.
- **New features** — no scope creep. This is purely a UI refresh; engine, analysis, and routes stay identical.

---

## 9. Acceptance Criteria

- Lighthouse Performance ≥ 95 on the analysis page (currently unknown — measure baseline first).
- INP < 100ms on move-list keyboard navigation (today the stale-closure handler causes occasional dropped frames).
- First Contentful Paint shows a styled skeleton, not a white flash.
- Every panel transition under 300ms, every hover state under 120ms.
- Zero `alert()` calls in the codebase.
- `page.tsx` under 400 lines.
