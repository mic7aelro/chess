# Project Mercury ♟️

*A Chess.com-style Game Review System*

---

## Overview

Mercury is a chess game analysis tool that analyses games move-by-move using Stockfish, classifies every move, calculates accuracy, detects openings via the Lichess API, and delivers a clean interactive review interface.

---

## Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | Next.js 15, React 19, TypeScript, Tailwind CSS, react-chessboard, chess.js, Recharts, lucide-react |
| Backend  | Python 3.12+, FastAPI 0.115, Uvicorn, python-chess, Motor (async MongoDB), python-dotenv, requests |
| Database | MongoDB Atlas — `mercuryChess` DB with `folders`, `games`, `analyses` collections |
| Engine   | Stockfish via UCI (python-chess bridge) |
| Openings | Lichess Explorer API (Masters + general DB, optional `LICHESS_TOKEN`) |
| Hosting  | Vercel (frontend) · Railway (backend) |

---

## Project Structure

```
mercury-chess/
├── backend/
│   ├── main.py                  # FastAPI app, CORS, router registration
│   ├── db.py                    # Motor/MongoDB client (lazy singleton)
│   ├── requirements.txt
│   ├── routers/
│   │   ├── analysis.py          # /api/analysis/ — batch, streaming SSE, eval, best-move, opening
│   │   └── library.py           # /library/ — folders + games CRUD
│   └── services/
│       └── engine.py            # Stockfish, classification, accuracy, Elo
├── docs/
│   ├── TODO.md                  # Roadmap and backlog
│   ├── FRONTEND_SPEC.md
│   ├── commands.md              # Slash command reference
│   └── move-classifications.md  # Full classification logic
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Root — all state, SSE analysis, explore mode
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── BoardPanel.tsx   # Chessboard, eval bar, highlights
│   │   │   ├── EngineLines.tsx  # Top engine lines with SVG piece icons
│   │   │   ├── EvalGraph.tsx    # Recharts area chart, click-to-navigate
│   │   │   ├── MoveList.tsx     # Move list with inline explore branches
│   │   │   ├── AccuracyCards.tsx
│   │   │   ├── EvalBar.tsx
│   │   │   ├── LibraryPanel.tsx # Folder/game browser, save/load
│   │   │   └── PgnInput.tsx
│   │   ├── lib/
│   │   │   └── library.ts       # API calls for library endpoints
│   │   └── types/
│   │       └── index.ts         # Shared TypeScript interfaces
│   └── package.json
└── .claude/
    └── commands/                # Slash commands: /commit /push /bump /deploy /review /analyse-perf /pr
```

---

## Features (built)

- **Full game review** — paste PGN → SSE streaming analysis with progress bar
- **Move classification** — Book, Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake, Miss, Blunder
- **Win-probability model** — `P(win) = 1 / (1 + 10^(−cp/400))` — mirrors Chess.com approach
- **Brilliant detection** — two paths: material sacrifice (net ≥ 200cp, piece hanging, no recapture) or surprising quiet queen move
- **Great detection** — only viable resource; WP gap to second-best > 25%; contested position
- **Miss detection** — had ≥ 85% WP, dropped below 75%, lost ≥ 20% WP
- **Accuracy score** — `exp(−0.003 × avg_loss)`, book moves excluded, cp_loss capped at 600
- **Elo estimation** — interpolated across fixed breakpoints from accuracy %
- **Opening detection** — Lichess Masters → Lichess general DB fallback; book moves marked, excluded from accuracy
- **SSE streaming** — `/api/analysis/stream` streams progress events then final result
- **Interactive eval** — `/api/analysis/eval` uses persistent engine instance (no per-request startup)
- **Best move endpoint** — `/api/analysis/best-move` for play-vs-engine
- **Explore mode** — drag pieces in analysis to branch; `ExploreFrame` stack; Esc to return
- **Progressive deepening** — sequential eval requests (depth steps) updating engine lines live
- **Library** — save/load games with folder organisation, stored in MongoDB Atlas
- **Free play mode** — play from start position, then hit Review to analyse

---

## Backend: Key Implementation Details

### Engine (`services/engine.py`)
- `ANALYSIS_DEPTH = 18` — depth for batch game analysis (deterministic)
- `SURPRISE_DEPTH = depth 5` — shallow pass to detect non-obvious moves
- `ENGINE_THREADS = 4`, `ENGINE_HASH_MB = 256` — tune for hardware
- Persistent `_eval_engine` singleton for interactive eval (avoids per-request startup)
- `_eval_lock` (threading.Lock) guards shared engine access

### Classification thresholds (WP loss)
| Classification | Threshold |
|----------------|-----------|
| Best | < 0.8% |
| Excellent | 0.8–2.5% |
| Good | 2.5–6% |
| Inaccuracy | 6–12% |
| Mistake | 12–22% |
| Blunder | ≥ 22% |

### Opening detection
- Tries Lichess Masters first, then general Lichess DB
- Persistent `requests.Session` with optional `LICHESS_TOKEN` auth
- Capped at ply 20 (move 10)

### MongoDB schema
- `folders` — `{ name, createdAt }`
- `games` — `{ name, pgn, white, black, date, savedAt, folderId?, analysisId? }`
- `analyses` — `{ result, analyzedAt }` (heavy JSON stored separately from game doc)

---

## Frontend: Key Implementation Details

### State (all in `page.tsx`)
| State | Description |
|-------|-------------|
| `result` | Full `AnalysisResult` from backend |
| `selectedPly` | Currently viewed move |
| `exploreStack` | History of explore positions |
| `exploreFrame` | Current explore position |
| `deepLines` | Live engine lines from progressive deepening |
| `panelState` | `menu | paste | analysis | freeplay | library` |

### Panel states
- `menu` — landing screen
- `paste` — PGN input + Analyse button
- `analysis` — full review UI
- `freeplay` — free play with move history + Review button
- `library` — folder/game browser

### API base URL
Set via `NEXT_PUBLIC_API_URL` env var (falls back to `http://localhost:8000`).

---

## Environment Variables

### Backend (Railway)
| Var | Description |
|-----|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `LICHESS_TOKEN` | Optional — higher Lichess API rate limits |
| `PORT` | Injected by Railway — used in start command |

### Frontend (Vercel)
| Var | Description |
|-----|-------------|
| `NEXT_PUBLIC_API_URL` | Railway backend URL |

### Start command (Railway)
```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

---

## Slash Commands

See `docs/commands.md` for full reference.

| Command | What it does |
|---------|-------------|
| `/commit` | Stage and commit, no push |
| `/push` | Commit if needed, then push to current branch (never main) |
| `/bump patch\|minor\|major` | Create next version branch from current `vX.Y.Z` |
| `/deploy` | Run deployment readiness checklist |
| `/review` | Pre-push diff review with go/no-go verdict |
| `/analyse-perf` | Audit frontend + backend for real performance issues |
| `/pr` | Push branch and open PR into main |
