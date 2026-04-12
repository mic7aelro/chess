Analyse Mercury Chess for performance issues across frontend and backend. Look for real problems, not hypothetical ones:

## Frontend
1. Read `frontend/src/app/page.tsx` and check for:
   - `useEffect` hooks with missing or overly broad dependency arrays causing unnecessary re-renders
   - State updates inside loops or tight intervals
   - Large components that should be memoised (`React.memo`, `useMemo`, `useCallback`)
   - Fetch calls that fire on every render instead of once
   - Heavy computations running on the main thread that could move to a worker

2. Check `frontend/src/components/` for:
   - Components re-rendering on every parent render without memo
   - Inline object/function creation in JSX props (causes reference inequality)

3. Check bundle size concerns:
   - Any large libraries imported in full when only part is needed
   - Missing `dynamic()` imports for heavy components

## Backend
1. Read `backend/routers/library.py` and check for:
   - N+1 query patterns (fetching documents one-by-one in a loop)
   - Missing indexes (what fields are we filtering/sorting on — are they indexed?)
   - Unbounded `to_list(length=None)` calls on large collections
   - Synchronous blocking calls inside async route handlers

2. Read `backend/services/engine.py` and check for:
   - Engine instances being created per-request instead of reused
   - Analysis results that could be cached but aren't

## Report format
For each issue found:
- File + line number
- What the problem is
- Concrete fix (code snippet if short)

Only report real issues visible in the code. Skip anything speculative.
