Run through the full deployment checklist for Mercury Chess (Vercel + Railway) and tell me what's ready and what's missing:

## Frontend (Vercel)
- [ ] `NEXT_PUBLIC_API_URL` env var set in Vercel project settings (points to Railway URL)
- [ ] No hardcoded `localhost` URLs remaining in `frontend/src/`
- [ ] `next build` passes locally without errors — run it and report output
- [ ] PWA manifest exists at `frontend/public/manifest.json`
- [ ] No `.env` files committed

## Backend (Railway)
- [ ] `MONGODB_URI` env var set in Railway service
- [ ] `LICHESS_TOKEN` env var set in Railway service
- [ ] Start command is `uvicorn main:app --host 0.0.0.0 --port $PORT` (uses Railway's injected $PORT)
- [ ] CORS `allow_origins` includes the production Vercel URL, not just localhost
- [ ] `requirements.txt` is up to date — run `pip freeze` and compare

## Database (MongoDB Atlas)
- [ ] Network access allows connections from Railway (0.0.0.0/0 or Railway IP range)
- [ ] `chess` database exists with `folders`, `games`, `analyses`, `repertoire` collections

## General
- [ ] All changes committed and pushed to main
- [ ] No console.log or debug code left in frontend
- [ ] TODO.md updated with completed items

Report each item as ✅ confirmed, ❌ missing/broken, or ⚠️ cannot verify (needs manual check).
At the end give me a prioritised list of what to fix before deploying.
