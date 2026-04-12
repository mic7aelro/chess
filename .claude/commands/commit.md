Stage all changes and commit them (no push):

1. Run `git status` and `git diff` to understand what changed
2. If there are no changes to commit, say so and stop
3. Run `git log --oneline -5` to match the existing commit style
4. Stage all modified and new files with `git add -A` (but warn me and skip any `.env` files or secrets)
5. Write a concise commit message (imperative mood, under 72 chars, focus on the "why" not the "what")
6. Commit — do not push
