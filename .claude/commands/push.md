Push the current branch to remote. If there are uncommitted changes, commit them first. Never push to main.

1. Run `git status` to check the current state
2. **If there are uncommitted changes (modified/untracked files):**
   a. Run `git diff` to understand what changed
   b. Run `git log --oneline -5` to match the existing commit style
   c. Stage all modified and new files with `git add -A` (but warn me and skip any `.env` files or secrets)
   d. Write a concise commit message (imperative mood, under 72 chars, focus on the "why" not the "what")
   e. Commit the changes
3. **If everything is already committed (clean working tree):**
   - Skip straight to pushing
4. Check the current branch — if it is `main` or `master`, stop and warn me instead of pushing
5. Push to the current branch (`git push origin <branch>`)
6. Review whether any of the following docs need updating based on what changed:
   - `mercury-chess/docs/TODO.md` — mark completed items, add new ones if scope changed
   - `mercury-chess/CLAUDE.md` — update if architecture or tech stack changed
   - Any inline comments or README if new features were added
7. If docs were updated, commit and push those changes too with message `docs: update after <feature>`
