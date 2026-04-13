# mic7aelr/chess — Deployment Guide

## Architecture

| Service | Platform | Trigger |
|---|---|---|
| Frontend (Next.js) | Vercel | Auto-deploy on push to `main` |
| Backend (FastAPI + Stockfish) | Railway | Auto-deploy on push to `main` |
| Database | MongoDB Atlas | Always-on |

---

## 1. DNS / Domain setup (Cloudflare → Vercel)

You need to do this **before** adding your custom domain in Vercel.

### Step 1 — Add DNS record in Cloudflare

1. Cloudflare dashboard → your domain → **DNS**
2. Add a **CNAME** record:
   - **Name**: `chess`
   - **Target**: `cname.vercel-dns.com`
   - **Proxy status**: **OFF** (grey cloud) — leave it off for now

### Step 2 — Add domain in Vercel

1. Vercel project → **Settings → Domains** → add `chess.mic7aelr.com`
2. Vercel verifies the CNAME and provisions an SSL cert automatically (~1 min)
3. Confirm the site loads at `https://chess.mic7aelr.com` before continuing

### Step 3 — Enable Cloudflare proxy (optional but recommended)

Once the site is confirmed working:

1. Cloudflare → **SSL/TLS** → set mode to **Full** (not Full Strict — Vercel's cert won't pass strict validation from Cloudflare's perspective)
2. DNS → flip the CNAME proxy to **ON** (orange cloud)

This gives you Cloudflare's CDN, DDoS protection, and analytics on top of Vercel's edge.

> **Why Full and not Full Strict?** Strict requires a CA-signed cert on the origin that Cloudflare can verify. Vercel's cert is valid for browsers but Cloudflare's proxy-to-origin check fails with Strict. Full skips that check while still encrypting the connection end-to-end.

---

## 2. MongoDB Atlas

1. Create a free M0 cluster (or use existing)
2. Network Access → Add IP `0.0.0.0/0` (Railway IPs are dynamic)
3. Database Access → create a user, copy the connection string
4. DB name: `chess` (collections auto-created on first write)

---

## 3. Railway (backend)

### First-time setup

1. `railway login` then connect repo:
   - Railway dashboard → New Project → Deploy from GitHub repo
   - Select `mic7aelro/chess`
   - Set **root directory** to `backend`
   - Set **watch branch** to `main`

2. Railway auto-detects `nixpacks.toml` and installs Stockfish, then runs the start command from `railway.toml`.

### Environment variables (set in Railway dashboard)

| Variable | Value |
|---|---|
| `MONGODB_URI` | Your Atlas connection string |
| `CORS_ORIGINS` | `https://chess.mic7aelr.com` |
| `LICHESS_TOKEN` | Optional — higher Lichess API rate limits |
| `ENGINE_THREADS` | `2` (matches Railway 2 vCPU) |
| `STOCKFISH_PATH` | Leave unset — defaults to `/usr/bin/stockfish` |

### Recommended resources

| Resource | Setting |
|---|---|
| vCPU | 2 |
| RAM | 1 GB |
| Region | US West or EU West (match your Atlas cluster region) |

### After deploy

Copy the Railway-generated URL (e.g. `https://mercury-production.up.railway.app`) — you'll need it for Vercel.

---

## 4. Vercel (frontend)

1. Vercel dashboard → New Project → Import `mic7aelro/chess`
2. Set **root directory** to `frontend`
3. Framework: Next.js (auto-detected)
4. **Watch branch**: `main` (auto-deploys on every merge)

### Environment variables (set in Vercel dashboard)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | Your Railway backend URL |

5. Add custom domain: `chess.mic7aelr.com` (after DNS is set up in step 1)

---

## 5. Ongoing deploys

Once connected, the workflow is just:

```
# work on feature branch
git push origin v1.x.x

# merge PR into main via GitHub
# → Railway redeploys backend automatically
# → Vercel redeploys frontend automatically
```

No manual deploy steps needed after initial setup.

---

## Health check

- Backend: `https://<railway-url>/health` → `{"status": "ok"}`
- Frontend: visit `https://chess.mic7aelr.com`
