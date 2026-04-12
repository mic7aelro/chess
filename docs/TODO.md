# Mercury Chess — Roadmap

## Completed
- MongoDB integration (replacing localStorage) — `motor` + 3-collection schema (folders, games, analyses)
- All hardcoded `localhost:8000` URLs replaced with `NEXT_PUBLIC_API_URL` env var
- Railway-ready backend: start command uses `$PORT`, env vars documented

---

## Backlog — App Polish

- [x] Repertoire: settings icon to toggle 1 vs 3 engine lines shown
- [x] Allow arrows to be used in repertoire page for navigation
- [x] Add line names somewhere in the repertoire move line
- [ ] Make miss badge larger and bolder on the board square
- [ ] Analysis modal: never cut off/scrollable — full graph always visible, moves box below
- [ ] Alternate line: left/right arrow navigation should not wipe the line
- [ ] Alternate line: remove eval scores next to moves (just show move numbers + SAN)

---

## Phase 1 — Ship It (mercurychess.mic7aelr.com)

- [ ] Deploy frontend as standalone Vercel project
- [ ] Deploy FastAPI backend to Railway or Fly.io
- [ ] Set production env vars: `MONGODB_URI`, `CORS_ORIGINS`
- [ ] Add subdomain `mercurychess.mic7aelr.com` via CNAME → Vercel
- [ ] PWA manifest (`manifest.json`) — name, icons, `display: standalone`
- [ ] iOS/Android meta tags in `<head>` for Add to Home Screen
- [ ] Test install on iPhone (Safari → Share → Add to Home Screen) and Android

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
- [ ] Detect games not yet in Mercury library → auto-analyse + save
- [ ] Auto-folder: "Chess.com — {Month Year}"
- [ ] Badge/notification when new reviewed games are ready
- [ ] Toggle: auto-review on/off, how many recent games to pull

---

## Phase 4 — Native (later)

- [ ] Evaluate Tauri (lighter) vs Electron (more mature) for desktop wrapper
- [ ] PyInstaller bundle for FastAPI + Stockfish backend binary
- [ ] Package as `.dmg` for macOS via electron-builder or Tauri bundler
- [ ] Auto-updater so users don't need to reinstall manually
