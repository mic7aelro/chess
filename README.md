# Mercury Chess

A Chess.com-style game review and analysis tool built with a FastAPI backend and Next.js frontend. Mercury analyses your games move-by-move using Stockfish, classifies every move, calculates accuracy, detects openings via the Lichess Masters database, and delivers a clean interactive review interface.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
- [API Reference](#api-reference)
- [Move Classification System](#move-classification-system)
- [Accuracy & Elo Estimation](#accuracy--elo-estimation)
- [Opening Detection](#opening-detection)
- [Progressive Deepening](#progressive-deepening)
- [Frontend Architecture](#frontend-architecture)
- [Roadmap](#roadmap)

---

## Features

- **Full game review** — paste any PGN and get a complete move-by-move analysis
- **Move classification** — every move classified as Book, Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake, Miss, or Blunder using a win-probability model
- **Accuracy score** — per-player accuracy percentage (0–100) excluding book moves
- **Game Elo estimate** — performance rating derived from accuracy
- **Opening detection** — identifies openings via the Lichess Masters API with ECO codes (e.g. `C65 · Ruy López: Berlin Defense`)
- **Engine lines** — top 3 Stockfish lines per position with progressive deepening (0.3s → 1s → 3s → … → 80s)
- **Interactive board** — step through moves, drag pieces to explore alternatives, right-click to highlight squares
- **Evaluation graph** — clickable area chart with a live dot marker at the selected position
- **Eval bar** — vertical bar showing White/Black advantage in real time
- **Explore mode** — play alternative lines from any position; branch shown inline in the move list
- **Free play mode** — play from the starting position and hit Review to analyse the game
- **Last-move highlights** — green highlight on the from/to squares of the last move played
- **Classification summary** — per-player counts for each classification type with Chess.com-accurate colours

---

## Architecture

```
┌─────────────────────────┐        HTTP/JSON        ┌──────────────────────────┐
│      Next.js Frontend   │ ◄────────────────────── │    FastAPI Backend       │
│   (React 19, Tailwind)  │                          │   (Python, Uvicorn)      │
│                         │ ──── POST /api/analysis/ │                          │
│  • BoardPanel           │ ──── POST /api/analysis/ │  • parse_pgn()           │
│  • EngineLines          │        eval              │  • analyse_game()        │
│  • EvalGraph            │                          │  • eval_position()       │
│  • MoveList             │                          │  • _classify()           │
│  • AccuracyCards        │                          │  • _collect_book_moves() │
└─────────────────────────┘                          └──────────┬───────────────┘
                                                                │
                                                    ┌───────────▼───────────┐
                                                    │       Stockfish        │
                                                    │  (UCI, multipv=3)      │
                                                    └───────────────────────┘
                                                                │
                                                    ┌───────────▼───────────┐
                                                    │  Lichess Masters API   │
                                                    │  (opening detection)   │
                                                    └───────────────────────┘
```

---

## Tech Stack

| Layer    | Technology                                                                  |
|----------|-----------------------------------------------------------------------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, react-chessboard, chess.js  |
| Charts   | Recharts                                                                    |
| Backend  | Python 3.12+, FastAPI 0.115, Uvicorn                                        |
| Engine   | Stockfish (via python-chess UCI bridge)                                     |
| Openings | Lichess Masters Explorer API (no key required)                              |
| Hosting  | Vercel (frontend) · Railway (backend) · MongoDB Atlas (database)            |

---

## Project Structure

```
mercury-chess/
├── backend/
│   ├── main.py                   # FastAPI app, CORS config
│   ├── requirements.txt
│   ├── routers/
│   │   └── analysis.py           # POST /api/analysis/ and /eval endpoints
│   └── services/
│       └── engine.py             # Stockfish integration, classification, accuracy
├── docs/
│   └── move-classifications.md   # High-level and low-level logic for each classification
└── frontend/                     # Next.js app — deployed to Vercel
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx          # Root page, all state management
    │   │   ├── layout.tsx
    │   │   └── globals.css
    │   ├── components/
    │   │   ├── BoardPanel.tsx    # Chessboard, eval bar, square highlights
    │   │   ├── EngineLines.tsx   # Top engine lines with SVG piece icons
    │   │   ├── EvalGraph.tsx     # Recharts area chart with click-to-navigate
    │   │   ├── MoveList.tsx      # Move list with inline explore branches
    │   │   └── AccuracyCards.tsx # Per-player accuracy, Elo, classification counts
    │   ├── lib/
    │   │   └── library.ts        # Shared utility functions
    │   └── types/
    │       └── index.ts          # Shared TypeScript interfaces
    └── package.json
```

---

## Getting Started

### Prerequisites

- **Python 3.12+**
- **Node.js 18+**
- **Stockfish** installed and accessible

```bash
# macOS
brew install stockfish

# Ubuntu/Debian
sudo apt install stockfish
```

> If Stockfish is not at `/opt/homebrew/bin/stockfish`, update `STOCKFISH_PATH` in `backend/services/engine.py`.

---

### Backend Setup

```bash
cd mercury-chess/backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the server
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

---

### Frontend Setup

```bash
cd mercury-chess/frontend

npm install
npm run dev
```

Open `http://localhost:3000`.

---

## API Reference

### `POST /api/analysis/`

Analyses a full game from PGN.

**Request**
```json
{
  "pgn": "1. e4 e5 2. Nf3 Nc6 3. Bb5 ..."
}
```

**Response**
```json
{
  "headers": { "White": "PlayerA", "Black": "PlayerB", "Result": "1-0" },
  "starting_fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "initial_lines": [
    { "san": "e4", "moves": ["e4", "e5", "Nf3", "Nc6"], "eval": 18 }
  ],
  "moves": [
    {
      "ply": 1,
      "san": "e4",
      "from_sq": "e2",
      "to_sq": "e4",
      "eval": 18,
      "cp_loss": 0,
      "classification": "book",
      "is_book": true,
      "opening_name": "King's Pawn Game",
      "opening_eco": "B00",
      "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      "top_lines": [ { "san": "e5", "moves": ["e5", "Nf3", "Nc6"], "eval": 18 } ],
      "alt_lines": [ { "san": "c5", "moves": ["c5", "Nf3", "d6"], "eval": 15 } ]
    }
  ],
  "opening": { "name": "Ruy López: Berlin Defense", "eco": "C65" },
  "white": { "accuracy": 91.3, "elo": 2047 },
  "black": { "accuracy": 84.7, "elo": 1712 }
}
```

---

### `POST /api/analysis/eval`

Evaluates a single FEN position. Used by the frontend for progressive deepening.

**Request**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "time": 3.0
}
```

**Response**
```json
{
  "eval": 18,
  "top_lines": [
    { "san": "e5", "moves": ["e5", "Nf3", "Nc6", "Bb5"], "eval": 18 }
  ],
  "is_white_to_move": false
}
```

---

## Move Classification System

Mercury uses a **win-probability model** rather than raw centipawn loss to classify moves. This mirrors the approach used by major chess platforms and produces more meaningful classifications across all game phases — a 50cp loss in a dead-equal endgame is very different from a 50cp loss in a complex middlegame.

### Win Probability Formula

```
P(win) = 1 / (1 + 10^(−cp / 400))
```

This is an Elo-based sigmoid where a 400cp advantage corresponds to approximately 90% win probability.

### Classification Thresholds

| Classification | Symbol | Condition | Colour |
|----------------|--------|-----------|--------|
| **Book**       | `⊕`   | Move is in Lichess opening theory (Masters or general DB) | `#a0784a` |
| **Brilliant**  | `!!`  | Material sacrifice or surprising quiet queen move; WP loss < 2%; position still playable (WP ≥ 40%) | `#1fada8` |
| **Great**      | `!`   | Only viable resource; WP gap to second-best > 25%; contested position (12% < WP < 88%) | `#5c8fff` |
| **Miss**       | `⊘`   | Had ≥ 85% WP before, dropped below 75%, lost ≥ 20% WP | `#e05c2a` |
| **Best**       | `★`   | WP loss < 0.8% | `#6fbc5b` |
| **Excellent**  | `✦`   | WP loss 0.8%–2.5% | `#6fbc5b` |
| **Good**       | `✓`   | WP loss 2.5%–6% | `#96bc4b` |
| **Inaccuracy** | `?!`  | WP loss 6%–12% | `#f4bf00` |
| **Mistake**    | `?`   | WP loss 12%–22% | `#e07b2a` |
| **Blunder**    | `??`  | WP loss ≥ 22% | `#ca3431` |

### Brilliant Move Detection

A move is flagged as a Brilliant candidate by `_is_brilliant()` via two paths. Both require the moving piece to be worth ≥ 300cp (minor piece or higher).

**Path 1 — Material sacrifice:**
- The piece moves to a square where it can be captured (it is hanging after the move)
- Net material loss ≥ 200cp (e.g. knight for a pawn, or piece for nothing)
- Major-piece sacrifices (rook/queen, net ≥ 500cp) are brilliant **without** requiring surprise
- Smaller sacrifices require the move to be a `surprise` (not in the engine's shallow top-5 at depth 5)

**Path 2 — Surprising quiet queen move:**
- Moving piece is a queen (value ≥ 900cp); no capture made; piece is not hanging after
- Move is a `surprise` (not in the engine's shallow top-5)
- Position was not already clearly winning before (`win_prob < 0.80`)
- Rooks are excluded — relocating to an open file is standard, not brilliant

**Final gate in `_classify()`:** even if flagged brilliant, all must hold:
- WP loss < 2%
- `score_mover > −100cp` (position is not clearly bad after)
- `win_prob(score_mover) ≥ 0.40` (still playable/winning)
- For non-sacrifices: position was not already completely won (`win_prob(score_before) < 0.95`)

> See `docs/move-classifications.md` for the full logic of every classification type.

---

## Accuracy & Elo Estimation

### Accuracy Formula

Book moves are excluded from accuracy calculation since they reflect theory knowledge, not decision quality. For each remaining move, centipawn loss is capped at 600cp to prevent a single catastrophic blunder from collapsing an otherwise strong game score.

```
avg_loss  = mean( min(cp_loss, 600) )   for all non-book moves
accuracy  = exp(−0.003 × avg_loss)      ∈ [0, 1]
```

Scaled to a percentage: `accuracy × 100`.

### Elo Estimation

The accuracy percentage is interpolated across fixed breakpoints to produce a game performance rating:

| Accuracy | Estimated Elo |
|----------|---------------|
| 100%     | 3000          |
| 95%      | 2500          |
| 90%      | 2000          |
| 85%      | 1700          |
| 80%      | 1400          |
| 75%      | 1100          |
| 70%      | 800           |
| 60%      | 400           |
| 0%       | 100           |

Values between breakpoints are linearly interpolated.

---

## Opening Detection

Mercury queries the **Lichess Masters Explorer API** during analysis to identify the opening. No API key is required.

```
GET https://explorer.lichess.ovh/masters?fen=<FEN>&moves=1&topGames=0&recentGames=0
```

The backend walks each position from the start of the game, querying the API until the position is no longer found in the Masters database. All moves within theory are marked `is_book: true` and receive the `"book"` classification. Book moves are excluded from accuracy calculation.

The last recognised opening name and ECO code are returned as `opening` in the analysis response and displayed in the frontend review panel.

**Implementation details:**
- Capped at ply 20 (move 10) — games virtually never stay in book beyond this
- 4-second timeout per request; silently stops book detection on any network error
- Uses `requests` with a persistent session (no repeated handshakes)
- Optionally authenticated via `LICHESS_TOKEN` env var for higher rate limits

---

## Progressive Deepening

The frontend re-evaluates the current board position in the background using sequentially increasing Stockfish time budgets:

```
0.3s → 1s → 3s → 5s → 10s → 20s → 40s → 80s
```

Each request is only sent after the previous one completes — **sequential, not parallel** — so Stockfish never runs more than one analysis process at a time. This avoids CPU contention and ensures each result is strictly stronger than the last.

A `deepFenRef` cancellation guard ensures that when the user navigates to a new position mid-sequence, any pending iterations are abandoned immediately and the sequence restarts for the new position.

Engine lines update on screen as each result arrives, providing an instant first estimate (~0.3s) that continuously improves in the background.

---

## Frontend Architecture

### Panel States

The right panel transitions between four states:

| State | Description |
|-------|-------------|
| `menu` | Landing screen with action options |
| `paste` | PGN / FEN input textarea + Analyse button |
| `analysis` | Full review: eval graph, accuracy cards, move list |
| `freeplay` | Free play mode with move history and Review button |

### Key State

All state is managed in `page.tsx` — no external state library.

| State | Type | Description |
|-------|------|-------------|
| `result` | `AnalysisResult \| null` | Full analysis from the backend |
| `selectedPly` | `number \| null` | Currently viewed move ply |
| `exploreStack` | `ExploreFrame[]` | History of positions when exploring alt lines |
| `exploreFrame` | `ExploreFrame \| null` | Current explored position |
| `deepLines` | `TopLine[]` | Live engine lines from progressive deepening |
| `panelState` | `PanelState` | Current right-panel view |

### Explore Mode

When the user drags a piece in analysis mode, an `ExploreFrame` is pushed onto `exploreStack`. The board shows the new position, engine lines update via progressive deepening, and `MoveList` renders the branching line inline with a `↳` indicator below the branch point. Pressing `Esc` or clicking "exit explore" returns to the reviewed game at the same ply.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `←` | Previous move |
| `→` | Next move |
| `Esc` | Exit explore mode |

---

## Roadmap

- [ ] User accounts and game history persistence
- [ ] Opening repertoire builder and deviation detection
- [ ] Critical moments detection (largest eval swings highlighted on graph)
- [ ] "Why was this a blunder?" — show the punishing continuation
- [ ] Multi-game accuracy trends and performance charts
- [ ] Player style analysis (tactical vs positional tendencies)
- [ ] Import games from Chess.com / Lichess by username
- [ ] Engine evaluation cache (Redis) to skip re-analysis of seen positions
- [ ] Mobile-responsive layout
- [ ] Multiplayer analysis / shared review sessions
