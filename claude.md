# Project Mercury ♟️

*A Chess.com-style Game Review System*

---

## 🧠 Overview

Project Mercury is a custom chess game analysis tool inspired by Chess.com’s game review feature. It uses a strong chess engine to evaluate moves and provides detailed feedback including evaluation bars, move classifications, accuracy scores, and estimated Elo performance.

---

## 🧩 Core Features

* Evaluation bar (live engine score)
* Engine lines (best moves / PV)
* Move-by-move evaluation graph
* Move classification:

  * Best
  * Excellent
  * Good
  * Inaccuracy
  * Mistake
  * Blunder
  * Brilliant
* Opening (book) detection
* Accuracy percentage
* Estimated Elo performance

---

## 🧠 1. Engine

Use **Stockfish**:

* Free and open-source
* Extremely strong
* Supports UCI (Universal Chess Interface)

Outputs:

* Evaluation score
* Best moves (principal variation)
* Depth and search info

---

## 🔌 2. Engine Integration

### Python (recommended)

Use `python-chess`:

* Handles board logic
* Parses PGN files
* Communicates with Stockfish

```python
import chess
import chess.engine

engine = chess.engine.SimpleEngine.popen_uci("stockfish")

board = chess.Board()
info = engine.analyse(board, chess.engine.Limit(depth=20))

print(info["score"])
print(info["pv"])
```

---

## 📊 3. Evaluation Bar

Stockfish outputs:

* Positive → White advantage
* Negative → Black advantage

Normalize range:

```js
bar = (eval + 5) / 10
```

Handle:

* Centipawn values
* Mate scores (e.g. #3)

---

## 📈 4. Move Graph

Store evaluation after each move:

```json
[
  { "move": 1, "eval": 0.2 },
  { "move": 2, "eval": -0.5 }
]
```

Visualization:

* X-axis → move number
* Y-axis → evaluation

Libraries:

* Chart.js
* Recharts

---

## 🎯 5. Move Classification

### Centipawn Loss

```text
centipawn_loss = best_eval - played_eval
```

### Thresholds (adjustable)

| Category   | Loss (cp) |
| ---------- | --------- |
| Best       | 0–10      |
| Excellent  | 10–25     |
| Good       | 25–50     |
| Inaccuracy | 50–100    |
| Mistake    | 100–300   |
| Blunder    | 300+      |

---

## 💎 Brilliant Moves

Heuristic approach:

* Sacrifices material
* Improves evaluation significantly
* Possibly the only good move

Example rule:

```text
if (sacrifice && eval improves significantly):
    mark as "Brilliant"
```

---

## 📚 6. Opening Detection

Options:

* ECO database (local file)
* Online API (e.g. Lichess)

Mark moves as:

* "Book" if still in known opening

---

## 🎯 7. Accuracy Calculation

Approximation methods:

### Simple:

```text
accuracy = 100 - (average centipawn loss / scale)
```

### Better:

```text
accuracy = exp(-k * avg_centipawn_loss)
```

Typical interpretation:

* 90%+ → very strong
* 80% → good
* 70% → average

---

## 🧮 8. Estimated Elo Performance

Approximation:

| Accuracy | Elo   |
| -------- | ----- |
| 95%+     | 2500+ |
| 90%      | 2000  |
| 85%      | 1700  |
| 80%      | 1400  |
| 75%      | 1100  |

Formula:

```text
elo ≈ 3000 * accuracy - 2000
```

---

## 🧩 9. UI Components

* Chessboard (interactive)
* Evaluation bar
* Move list with labels:

  * Blunder
  * Mistake
  * Inaccuracy
  * Good
  * Excellent
  * Best
  * Brilliant
* Engine lines display (top moves)
* Move evaluation graph

---

## ⚙️ 10. Tech Stack

### Frontend:

* TypeScript
* React
* Tailwind CSS
* Zustand (state management)
* React Query (data fetching / caching)
* Recharts (graphs)

### Backend:

* Python
* FastAPI
* python-chess
* Stockfish

### Database:

* MongoDB (games, evals, opening trees)
* Redis (engine cache)

---

## 🗄️ 11. Data Systems

### Opening Tree

* Store position-based move frequencies and win rates
* Enables opening explorer and prep tools

### Personal Repertoire

* User-specific preferred moves and notes
* Detect when user leaves prep

### Engine Cache

* Cache evaluations per FEN
* Avoid recomputation

### Game Analysis Storage

* Store move-by-move evals and classifications
* Persist accuracy and Elo estimates

### Multi-PV Storage

* Store top engine lines per position

---

## 🚀 12. Development Roadmap

### Phase 1 (MVP)

* Load PGN
* Run engine analysis
* Store eval per move

### Phase 2

* Add move classification
* Build eval bar + graph

### Phase 3

* Add accuracy %
* Add Elo estimation
* Opening detection

### Phase 4 (Advanced)

* Multi-PV engine lines
* Brilliant move detection
* UI polish

---

## 🔮 13. Future Features

### 🔥 “Why was this a blunder?”

Show:

* Best move
* Consequence line
* Eval swing

---

### 🎯 “Critical moments”

Detect:

* Big eval swings
* Turning points

---

### 🧠 “Style analysis”

Analyze player tendencies:

* Aggressive vs passive
* Tactical vs positional

---

## ⚠️ Notes

* Exact accuracy and brilliance logic used by major platforms is proprietary
* This project can replicate ~80–90% of the experience with custom heuristics

---

## 🎯 Goal

Build a fully functional, visually clean, and insightful chess analysis tool that provides players with meaningful feedback on their games.

---