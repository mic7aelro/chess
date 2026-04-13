# Mercury Chess — Roadmap

## Completed
- MongoDB integration (replacing localStorage) — `motor` + 3-collection schema (folders, games, analyses)
- All hardcoded `localhost:8000` URLs replaced with `NEXT_PUBLIC_API_URL` env var
- Railway backend live at `chess-production-5b01.up.railway.app` — Dockerfile build, Stockfish via `/usr/games`, PORT via Railway env
- Vercel frontend live at `chess.mic7aelr.com` — auto-deploys on merge to `main`
- MongoDB renamed from `mercuryChess` to `chess`, data migrated
- Rebranded UI to `mic7aelr/chess`

---

## Backlog — App Polish

- [x] Repertoire: settings icon to toggle 1 vs 3 engine lines shown
- [x] Allow arrows to be used in repertoire page for navigation
- [x] Add line names somewhere in the repertoire move line
- [x] Make miss badge larger and bolder on the board square
- [x] Tablebase probe shown in analysis and repertoire builder (≤7 pieces)
- [x] Re-analyse now writes updated result back to MongoDB automatically
- [x] Move classification icons replaced with Lucide set (Zap, Award, Star, TrendingUp, etc.)
- [x] Analysis modal: never cut off/scrollable — full graph always visible, moves box below
- [x] Alternate line: left/right arrow navigation should not wipe the line
- [x] Alternate line: remove eval scores next to moves (just show move numbers + SAN)

---

## Rebrand (mic7aelr/chess)

- [x] Rename GitHub repo to `chess`
- [x] Rename local folder to `chess`
- [x] Update top-left UI branding to `mic7aelr/chess`
- [x] Update page title in layout.tsx
- [x] Update Vercel project name + domain to `chess.mic7aelr.com`
- [ ] Update Railway service name
- [ ] New favicon / logo if needed

---

## Phase 1 — Ship It (chess.mic7aelr.com)

- [x] Deploy frontend as standalone Vercel project
- [x] Deploy FastAPI backend to Railway
- [x] Set production env vars: `MONGODB_URI`, `CORS_ORIGINS`
- [x] Add subdomain `chess.mic7aelr.com` via CNAME → Vercel (see docs/DEPLOY.md)
- [ ] Auth — decide approach (see Phase 1.5 below)
- [ ] PWA manifest (`manifest.json`) — name, icons, `display: standalone`
- [ ] iOS/Android meta tags in `<head>` for Add to Home Screen
- [ ] Test install on iPhone (Safari → Share → Add to Home Screen) and Android

---

## Phase 1.5 — Auth

Options to evaluate:
- **HTTP Basic Auth** — simplest; just a username/password env var gate (`HTTP_BASIC_USER` / `HTTP_BASIC_PASS`) on the FastAPI backend; no user accounts, no frontend changes
- **Clerk / Auth.js** — full user accounts with Google/GitHub OAuth; library becomes per-user; more work but enables multi-user
- **Middleware-level (Vercel)** — password-protect the frontend at the edge with a Vercel middleware; backend stays open (CORS-gated)

- [ ] Decide auth approach
- [ ] Implement chosen approach
- [ ] Protect all library routes (folders, games, analyses) — analysis endpoints can stay public

---

## Phase 2 — Offline Support

- [ ] Integrate `stockfish.js` WASM build — runs engine in a browser Web Worker
- [ ] Replace backend SSE analysis stream with client-side engine worker
- [ ] Service worker caches app shell for fully offline UI
- [ ] IndexedDB for offline library when network is unavailable

---

## Phase 3 — Chess.com Auto-Review

- [ ] Chess.com username field in settings
- [ ] Poll `api.chess.com/pub/player/{username}/games/{year}/{month}` for recent games
- [ ] Detect games not yet in library → auto-analyse + save
- [ ] Auto-folder: "Chess.com — {Month Year}"
- [ ] Badge/notification when new reviewed games are ready
- [ ] Toggle: auto-review on/off, how many recent games to pull

---

## Phase 4 — Native (later)

- [ ] Evaluate Tauri (lighter) vs Electron (more mature) for desktop wrapper
- [ ] PyInstaller bundle for FastAPI + Stockfish backend binary
- [ ] Package as `.dmg` for macOS via electron-builder or Tauri bundler
- [ ] Auto-updater so users don't need to reinstall manually
