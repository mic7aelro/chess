Push the current branch and open a pull request into main. Follow these steps:

1. Run `git status` — if there are uncommitted changes, stop and tell me to run /push first
2. Run `git log main..HEAD --oneline` to see all commits on this branch vs main
3. Run `git diff main...HEAD` to understand the full set of changes
4. Push the current branch to origin: `git push -u origin HEAD`
5. Create a PR using `gh pr create` with:
   - Title: short, imperative, under 70 chars (e.g. "Add MongoDB library integration")
   - Body structured as:

```
## What changed
<2-4 bullet points covering the key changes>

## Why
<one sentence on the motivation>

## Test plan
<bulleted checklist of what to verify before merging>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

6. After the PR is created, print the PR URL
7. Check if TODO.md has items that should be marked complete based on this PR — if so, update, commit directly to this branch, and push again

Note: this pushes to a PR branch, NOT directly to main. Never force-push. Never push directly to main.
