Review all uncommitted changes before pushing. Give me a clear picture of what's changed and flag anything that looks risky:

1. Run `git status` to see all modified, new, and deleted files
2. Run `git diff` to read the full diff
3. Run `git log --oneline -5` to see recent commit history
4. For each changed file, summarise:
   - What changed and why (inferred from the diff)
   - Any potential issues: broken imports, hardcoded values, missing env vars, security concerns, unfinished TODOs left in code
5. Flag anything that should NOT be committed: `.env` files, secrets, large binaries, commented-out debug code, console.logs left in
6. Give an overall go / no-go recommendation with a one-line reason
7. If there are issues, list exactly what to fix before pushing
