# Slash Commands

Custom Claude Code commands available in this project.

---

## `/commit`
Stage all changes and commit them — no push.

- Skips gracefully if there's nothing to commit
- Warns and skips `.env` files or secrets
- Matches existing commit message style from `git log`

---

## `/push`
Push the current branch to remote. Commits first if needed.

- If there are uncommitted changes → commits them, then pushes
- If working tree is clean → skips straight to pushing
- Refuses to push to `main` or `master` (warns instead)
- Reviews and updates `TODO.md` / `CLAUDE.md` if docs need updating after the push

---

## `/bump`
Create a new version branch based on semantic versioning.

- `patch` → `v0.1.0` → `v0.1.1`
- `minor` → `v0.1.0` → `v0.2.0`
- `major` → `v0.1.0` → `v1.0.0`

Usage: `/bump patch | minor | major`

---

## `/review`
Review all uncommitted changes before pushing — gives a go/no-go verdict.

- Summarises what changed and why (inferred from diff)
- Flags risky things: secrets, hardcoded values, broken imports, debug code
- Ends with a prioritised list of what to fix before pushing

---

## `/deploy`
Run through the full deployment readiness checklist (Vercel + Railway + MongoDB Atlas).

Reports each item as ✅ confirmed / ❌ missing / ⚠️ needs manual check:

- **Frontend (Vercel):** env vars, no hardcoded localhost, `next build` passes, no committed `.env`
- **Backend (Railway):** env vars, CORS includes prod URL, `requirements.txt` up to date, correct start command
- **Database (MongoDB Atlas):** network access, collections exist

Ends with a prioritised fix list before deploying.

---

## `/analyse-perf`
Audit the codebase for real, visible performance issues.

- **Frontend:** bad `useEffect` deps, missing memoisation, inline object creation in JSX, heavy imports
- **Backend:** N+1 queries, unbounded queries, engine instances created per-request, missing indexes

Reports: file + line number + concrete fix. Skips speculative issues.
