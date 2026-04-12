# Move Classification Logic

Mercury classifies every played move into one of 10 categories. All logic lives in `backend/services/engine.py`.

---

## How evaluation works

Before classifying, each move is evaluated using **win probability** — a sigmoid conversion of Stockfish's centipawn score:

```
win_prob = 1 / (1 + 10^(-cp / 400))
```

- `cp = +400` → ~90% win probability
- `cp = 0` → 50% (equal)
- Mate scores (`±10000`) clamp to 1.0 / 0.0

The key metric used for every classification is **expected loss**:

```
expected_loss = max(0, win_prob(best_eval) - win_prob(played_eval))
```

Both evals are always from the **moving side's point of view**.

---

## Pre-classification flags

Three boolean flags are computed before `_classify()` is called:

### `surprise`
The played move is **not** in Stockfish's top-3 at shallow depth (depth 8 / 5 ply depending on context).  
Shallow depth mirrors what a human finds "obvious" — engines find brilliant moves at depth 18 but not depth 8.

### `is_only_move`
The win probability gap between the best and second-best move exceeds **0.25** (25%).  
Signals that only one move preserves the position.

### `brilliant` / `is_sacrifice`
Computed by `_is_brilliant()` — see the Brilliant section below.

---

## Classifications

### Book

**High level:** The move is within known opening theory.

**Low level:**
- Before engine analysis, Mercury fetches the position from the Lichess opening explorer API (Masters DB first, then general Lichess DB).
- If the API returns known continuations for the FEN, the move is marked `book`.
- Capped at the first 20 ply (move 10) — games virtually never stay in book beyond this.
- Book moves are **excluded** from accuracy calculations.
- Opening name and ECO code propagate forward so every book move displays a name, not just positions where the API returned one.

**Source:** `_collect_book_moves()` and `_fetch_opening()` — lines 55–110.

---

### Brilliant (`!!`)

**High level:** A surprising sacrifice or deep quiet queen move that turns out to be objectively best.

**Low level — two detection paths in `_is_brilliant()`:**

**Path 1 — Material sacrifice** (requires piece value ≥ 300cp, i.e. minor piece or higher):
- The piece moves to a square where it can be captured (it's "hanging" after the move).
- Net material loss ≥ 200cp (e.g. knight for a pawn, or piece for nothing).
- Major-piece sacrifices (net ≥ 500cp, rook/queen) are brilliant **without** requiring surprise — a queen sac leading to forced mate is spectacular regardless.
- Smaller sacrifices still require `surprise = True`.

**Path 2 — Surprising quiet queen move:**
- Moving piece is a queen (value ≥ 900cp).
- No capture made, piece is not hanging after the move.
- Move is a `surprise` (not in shallow top-5).
- Position was not already clearly winning before the move (`win_prob(score_before) < 0.80`).
- Rooks are excluded — relocating to an open file is standard, not brilliant.

**Final gate in `_classify()`** — even if `_is_brilliant()` returns `True`, all must hold:
- `expected_loss < 0.02` (< 2% WP loss — essentially the best move)
- `score_mover > -100` (position after is not clearly bad)
- `win_prob(score_mover) >= 0.40` (still playable or winning after)
- For non-sacrifices: `win_prob(score_before) < 0.95` (position wasn't already completely won)
- Sacrifices bypass the last check — the sacrifice *is* the winning path, so score_before may already be high.

**Source:** `_is_brilliant()` lines 326–374, gate in `_classify()` lines 296–301.

---

### Great (`!`)

**High level:** The only viable move in a genuinely contested position, with a large gap to any alternative.

**Low level:**
- `is_only_move = True` — win probability gap between best and second-best move > 0.25.
- `expected_loss < 0.02` — the played move is essentially optimal.
- Position is neither trivially easy (`wp_best < 0.88`) nor completely lost (`wp_best > 0.12`) — must be a contested game.

The "only move" check catches defensive resources, forced sequences, and subtle positional moves where missing the right continuation costs dearly.

**Source:** `_classify()` lines 303–307, `is_only_move` flag lines 188–192.

---

### Miss (`⊘`)

**High level:** Failing to capitalise on a winning advantage.

**Low level:**
- `expected_loss >= 0.20` — significant win probability lost.
- `win_prob(score_before) >= 0.85` — had a clear winning advantage beforehand.
- `win_prob(score_mover) < 0.75` — advantage is now gone or greatly reduced.

Miss is checked **before** Brilliant in the classification cascade — a move that throws away a winning position is a miss even if it has other properties.

**Source:** `_classify()` lines 285–287.

---

### Best (`★`)

**High level:** The objectively optimal move.

**Low level:**
- `expected_loss < 0.008` (< 0.8% win probability loss).
- Threshold is slightly relaxed from a theoretical 0.5% to absorb depth-18 evaluation noise — two separate engine calls on adjacent positions can legitimately differ by a few tenths of a pawn even for the top move.

**Source:** `_classify()` line 313–314.

---

### Excellent (`✦`)

**High level:** Very close to best, negligible practical difference.

**Low level:**
- `0.008 ≤ expected_loss < 0.025` (0.8%–2.5% win probability loss).

**Source:** `_classify()` lines 315–316.

---

### Good (`✓`)

**High level:** A solid move that maintains the position.

**Low level:**
- `0.025 ≤ expected_loss < 0.06` (2.5%–6% win probability loss).

**Source:** `_classify()` lines 317–318.

---

### Inaccuracy (`?!`)

**High level:** A minor error that gives the opponent some additional chances.

**Low level:**
- `0.06 ≤ expected_loss < 0.12` (6%–12% win probability loss).

**Source:** `_classify()` lines 319–320.

---

### Mistake (`?`)

**High level:** A significant error that meaningfully weakens the position.

**Low level:**
- `0.12 ≤ expected_loss < 0.22` (12%–22% win probability loss).

**Source:** `_classify()` lines 321–322.

---

### Blunder (`??`)

**High level:** A grave error with major consequences — often losing material or a decisive positional concession.

**Low level:**
- `expected_loss >= 0.22` (≥ 22% win probability loss).
- This is the fallthrough — any move not caught by a higher category with this level of loss.

**Source:** `_classify()` line 323.

---

## Classification cascade (order matters)

```
1. Book          → checked first, bypasses all engine thresholds
2. Miss          → checked before Brilliant to avoid mislabeling a blunder-level sac
3. Brilliant     → requires is_brilliant flag + tight loss threshold
4. Great         → requires is_only_move flag + tight loss threshold
5. Best          → expected_loss < 0.008
6. Excellent     → expected_loss < 0.025
7. Good          → expected_loss < 0.06
8. Inaccuracy    → expected_loss < 0.12
9. Mistake       → expected_loss < 0.22
10. Blunder      → fallthrough
```

---

## Thresholds at a glance

| Classification | Win Prob Loss      | Extra Conditions |
|----------------|--------------------|------------------|
| Book           | N/A                | Position in Lichess opening DB, ≤ ply 20 |
| Brilliant      | < 0.02             | Sacrifice (net ≥ 200cp) OR surprising quiet queen move; score after > -100cp; WP after ≥ 0.40 |
| Great          | < 0.02             | Only-move gap > 0.25; contested position (0.12 < WP < 0.88) |
| Miss           | ≥ 0.20             | Had advantage (WP ≥ 0.85); lost it (WP after < 0.75) |
| Best           | < 0.008            | — |
| Excellent      | 0.008 – 0.025      | — |
| Good           | 0.025 – 0.06       | — |
| Inaccuracy     | 0.06 – 0.12        | — |
| Mistake        | 0.12 – 0.22        | — |
| Blunder        | ≥ 0.22             | — |

---

## Piece values used for sacrifice detection

```
Pawn   = 100 cp
Knight = 300 cp
Bishop = 300 cp
Rook   = 500 cp
Queen  = 900 cp
```

Defined in `_PIECE_VALUES` (engine.py lines 37–44).
