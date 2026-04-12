import chess
import chess.engine
import chess.pgn
import io
import math
import os
import threading
import urllib.parse
from typing import Any

import requests as _requests

STOCKFISH_PATH  = "/opt/homebrew/bin/stockfish"
ANALYSIS_DEPTH   = 18                             # depth for batch game analysis
ANALYSIS_LIMIT   = chess.engine.Limit(depth=ANALYSIS_DEPTH)             # depth-only — deterministic scores
SURPRISE_DEPTH   = chess.engine.Limit(depth=5)                          # shallow pass — deterministic, stays non-obvious

# Tune these for your hardware:
#   Threads — number of CPU threads Stockfish uses (leave 2 cores for OS)
#   Hash    — transposition table size in MB (more = fewer re-lookups)
ENGINE_THREADS = 4    # M2 Air: 4–6 | M4/M5 Pro: 8–10
ENGINE_HASH_MB = 256

# ---------------------------------------------------------------------------
# Persistent engine for interactive eval (avoids per-request startup cost)
# ---------------------------------------------------------------------------
_eval_engine: chess.engine.SimpleEngine | None = None
_eval_lock = threading.Lock()

def _get_eval_engine() -> chess.engine.SimpleEngine:
    global _eval_engine
    if _eval_engine is None:
        _eval_engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        _eval_engine.configure({"Threads": ENGINE_THREADS, "Hash": ENGINE_HASH_MB})
    return _eval_engine

_PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 300,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


_OPENING_URLS = [
    "https://explorer.lichess.ovh/masters?fen={fen}&moves=1&topGames=0&recentGames=0",
    "https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=2000,2200,2500&fen={fen}&moves=1&topGames=0&recentGames=0",
]

_LICHESS_TOKEN: str | None = os.environ.get("LICHESS_TOKEN")

_SESSION = _requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; MercuryChess/1.0)",
    "Accept": "application/json",
})
if _LICHESS_TOKEN:
    _SESSION.headers["Authorization"] = f"Bearer {_LICHESS_TOKEN}"


def _fetch_opening(fen: str) -> tuple[bool, dict | None]:
    """Query Lichess opening explorer for the given FEN (tries Masters then Lichess DB).
    Returns (in_theory, opening_info) where:
      in_theory   — True if position has known continuations
      opening_info — {'name': str, 'eco': str} if a named opening is attached, else None
    """
    encoded = urllib.parse.quote(fen, safe="")
    for url_tpl in _OPENING_URLS:
        url = url_tpl.format(fen=encoded)
        try:
            resp = _SESSION.get(url, timeout=4)
            if resp.status_code == 401:
                print(f"[book] 401 Unauthorized — set LICHESS_TOKEN env var with a Lichess API token")
                return False, None
            resp.raise_for_status()
            data = resp.json()
            if not data.get("moves"):
                continue                # position not in this DB — try the next
            opening = data.get("opening") or {}
            info = {"name": opening["name"], "eco": opening.get("eco", "")} if opening.get("name") else None
            return True, info
        except Exception as exc:
            print(f"[book] fetch failed ({url[:70]}): {exc}")
    return False, None


def _collect_book_moves(game: chess.pgn.Game) -> tuple[dict[int, dict], dict | None]:
    """Walk game positions and fetch opening data until out of theory.
    Returns (book_by_ply, last_opening) where book_by_ply maps ply → opening info."""
    board = game.board()
    book_by_ply: dict[int, dict] = {}
    last_opening: dict | None = None

    for i, node in enumerate(game.mainline()):
        if i >= 20:          # cap at move 10 — virtually no game leaves book after this
            break
        in_theory, opening_info = _fetch_opening(board.fen())
        board.push(node.move)
        if not in_theory:
            print(f"[book] out of theory at ply {board.ply()}")
            break                       # position has no known continuations → out of book
        book_by_ply[board.ply()] = opening_info or {}
        if opening_info:
            last_opening = opening_info
        print(f"[book] ply {board.ply()} → book, opening={opening_info}")

    print(f"[book] collected {len(book_by_ply)} book plies, last_opening={last_opening}")
    return book_by_ply, last_opening


def get_opening(fen: str) -> dict:
    """Return opening info for a FEN, or empty dict if not in book."""
    _, info = _fetch_opening(fen)
    return info or {}


def parse_pgn(pgn_text: str) -> chess.pgn.Game:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Invalid PGN")
    return game


def analyse_game(pgn_text: str, on_progress=None) -> dict[str, Any]:
    """Analyse a full game.  on_progress(analyzed, total) is called after each move."""
    game = parse_pgn(pgn_text)

    headers = dict(game.headers)
    moves: list[dict] = []
    starting_fen = game.board().fen()
    total_moves = sum(1 for _ in game.mainline())

    # Emit total count immediately so the frontend can set up the bar
    if on_progress:
        on_progress(0, total_moves)

    # Fetch opening book data before starting Stockfish (separate HTTP calls)
    book_by_ply, last_opening = _collect_book_moves(game)

    # Build a ply → opening name map that propagates the last known name forward
    # so every book move shows an opening name, not just positions where the API
    # happened to return one.
    current_op: dict | None = None
    opening_by_ply: dict[int, dict] = {}
    for ply in sorted(book_by_ply.keys()):
        info = book_by_ply[ply]
        if info.get("name"):
            current_op = info
        if current_op:
            opening_by_ply[ply] = current_op

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        engine.configure({"Threads": ENGINE_THREADS, "Hash": ENGINE_HASH_MB})
        print(f"[engine] Stockfish threads={ENGINE_THREADS} hash={ENGINE_HASH_MB}MB depth={ANALYSIS_DEPTH}")
        board = game.board()

        prev_infos: list[dict] = engine.analyse(
            board, ANALYSIS_LIMIT, multipv=3
        )
        prev_score = _normalise_score(prev_infos[0]["score"], board.turn)
        initial_lines = _extract_lines(board, prev_infos)

        # Shallow pass on starting position for surprise baseline
        prev_shallow: list[dict] = engine.analyse(board, SURPRISE_DEPTH, multipv=5)

        for node in game.mainline():
            move = node.move
            san = board.san(move)
            turn = board.turn
            from_sq = chess.square_name(move.from_square)
            to_sq = chess.square_name(move.to_square)

            score_before = prev_score  # best available from moving side's POV

            # Surprise: move not in engine's top-3 at shallow depth (depth 8)
            # Using shallow depth mirrors what a human finds "obvious" —
            # strong engines find brilliant moves at depth 18 but not at depth 8.
            shallow_top_sans = {
                board.san(info["pv"][0])
                for info in prev_shallow
                if info.get("pv")
            }
            surprise = san not in shallow_top_sans

            # Only-move: gap between best and second-best is large
            is_only_move = False
            if len(prev_infos) >= 2 and prev_infos[1].get("pv"):
                second_score = _normalise_score(prev_infos[1]["score"], turn)
                wp_gap = _cp_to_win_prob(score_before) - _cp_to_win_prob(second_score)
                is_only_move = wp_gap > 0.25

            brilliant, is_sacrifice = _is_brilliant(board, move, surprise, score_before)

            # Alt lines: engine's top suggestions from THIS position, excluding the played move
            alt_lines = [
                line for line in _extract_lines(board, prev_infos)
                if line["san"] != san
            ][:2]

            board.push(move)

            is_book = board.ply() in book_by_ply
            book_info = opening_by_ply.get(board.ply(), {})

            infos: list[dict] = engine.analyse(
                board, ANALYSIS_LIMIT, multipv=3
            )
            score_opponent = _normalise_score(infos[0]["score"], board.turn)
            score_mover = -score_opponent

            cp_loss = max(0, score_before - score_mover)
            eval_white = score_mover if turn == chess.WHITE else -score_mover
            classification = (
                "book" if is_book
                else _classify(score_before, score_mover, brilliant, is_only_move, is_sacrifice)
            )
            top_lines = _extract_lines(board, infos)

            moves.append({
                "ply": board.ply(),
                "san": san,
                "from_sq": from_sq,
                "to_sq": to_sq,
                "eval": eval_white,
                "cp_loss": cp_loss,
                "classification": classification,
                "is_book": is_book,
                "opening_name": book_info.get("name"),
                "opening_eco": book_info.get("eco"),
                "fen": board.fen(),
                "top_lines": top_lines,
                "alt_lines": alt_lines,
            })

            prev_infos = infos
            prev_score = score_opponent
            prev_shallow = engine.analyse(board, SURPRISE_DEPTH, multipv=5)

            if on_progress:
                on_progress(len(moves), total_moves)

    # Exclude book moves from accuracy calculation
    white_losses = [m["cp_loss"] for m in moves if m["ply"] % 2 == 1 and not m["is_book"]]
    black_losses = [m["cp_loss"] for m in moves if m["ply"] % 2 == 0 and not m["is_book"]]
    white_acc = _accuracy(white_losses)
    black_acc = _accuracy(black_losses)

    return {
        "headers": headers,
        "starting_fen": starting_fen,
        "initial_lines": initial_lines,
        "moves": moves,
        "opening": last_opening,
        "white": {"accuracy": round(white_acc * 100, 1), "elo": _elo_from_accuracy(white_acc)},
        "black": {"accuracy": round(black_acc * 100, 1), "elo": _elo_from_accuracy(black_acc)},
    }


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

def _cp_to_win_prob(cp: int) -> float:
    """Win probability [0,1] via Elo-based sigmoid (400cp ≈ 90% win chance)."""
    if cp >= 10000:  # mate (any distance)
        return 1.0
    if cp <= -10000:
        return 0.0
    return 1.0 / (1.0 + 10.0 ** (-cp / 400.0))


def _classify(
    score_before: int,   # best eval from moving side's POV (pre-move)
    score_mover: int,    # eval for moving side after the played move
    brilliant: bool,
    is_only_move: bool,
    is_sacrifice: bool = False,
) -> str:
    wp_best   = _cp_to_win_prob(score_before)
    wp_played = _cp_to_win_prob(score_mover)
    expected_loss = max(0.0, wp_best - wp_played)

    # Miss: had a winning advantage but failed to capitalise
    if expected_loss >= 0.20 and wp_best >= 0.85 and wp_played < 0.75:
        return "miss"

    # Brilliant: surprising sacrifice or deep quiet move that turns out to be best.
    #   - essentially best at depth 18 (< 2% WP loss)
    #   - position after is not clearly bad (score_mover > -100cp)
    #   - position is still playable/winning after (WP after >= 0.40)
    #   - for non-sacrifice moves: position was not already completely won (WP < 0.95)
    #   - for sacrifice moves (queen/rook given up): bypass the "already won" check —
    #     the sacrifice IS the path to the win, so of course score_before is high
    if (brilliant
            and expected_loss < 0.02
            and score_mover > -100
            and wp_played >= 0.40
            and (is_sacrifice or wp_best < 0.95)):
        return "brilliant"

    # Great: the only viable resource in a genuinely contested position
    # Requires a large gap to second-best AND the position must not be trivially
    # easy (wp_best < 0.88) or completely lost (wp_best > 0.12)
    if is_only_move and expected_loss < 0.02 and 0.12 < wp_best < 0.88:
        return "great"

    # Standard win-probability thresholds
    # Best threshold is slightly relaxed (0.008 vs 0.005) to absorb depth-18
    # evaluation noise — two separate engine calls on adjacent positions can
    # legitimately differ by a few tenths of a pawn even for the top move.
    if expected_loss < 0.008:
        return "best"
    if expected_loss < 0.025:
        return "excellent"
    if expected_loss < 0.06:
        return "good"
    if expected_loss < 0.12:
        return "inaccuracy"
    if expected_loss < 0.22:
        return "mistake"
    return "blunder"


def _is_brilliant(board: chess.Board, move: chess.Move, surprise: bool, score_before: int = 0) -> tuple[bool, bool]:
    """Return (is_brilliant_candidate, is_sacrifice) for the move.

    Path 1 — True material sacrifice: piece (>= minor) moves to a square where
              it can be captured AND is not defended by an equal-or-lower-value
              piece of the mover. A defended piece is a trade, not a sacrifice.
              Net material loss to the mover must be >= 200cp.

    Path 2 — Surprising quiet queen move: queen relocates to a safe square,
              not in shallow top-5, position not already clearly winning (wp < 0.80).
    """
    moving_piece = board.piece_at(move.from_square)
    if moving_piece is None:
        return False, False
    moving_value = _PIECE_VALUES.get(moving_piece.piece_type, 0)
    if moving_value < 300:
        return False, False

    captured_piece = board.piece_at(move.to_square)
    captured_value = _PIECE_VALUES.get(captured_piece.piece_type, 0) if captured_piece else 0

    board_copy = board.copy()
    board_copy.push(move)

    # Checkmate is never a sacrifice — it's just the winning move.
    if board_copy.is_checkmate():
        return False, False

    piece_hanging  = board_copy.is_attacked_by(board_copy.turn, move.to_square)
    net_sacrifice  = moving_value - captured_value

    # Path 1 — material sacrifice (includes exchange sacrifices: rook for minor)
    if piece_hanging and net_sacrifice >= 150:
        mover_defenders = [
            sq for sq in board_copy.attackers(board.turn, move.to_square)
            if board_copy.piece_at(sq)
        ]
        if mover_defenders:
            # Only block if the cheapest recapture is CHEAPER than the piece just
            # moved — that means the mover gets material back (a trade, not a
            # sacrifice). If the cheapest recapture costs equal or more, the mover
            # is still down material overall (genuine exchange sacrifice).
            min_recapture = min(
                _PIECE_VALUES.get(board_copy.piece_at(sq).piece_type, 0)
                for sq in mover_defenders
            )
            if min_recapture < moving_value:
                return False, False
        return True, True

    # Paths below require surprise
    if not surprise:
        return False, False

    # Path 2 — surprising quiet queen move (rooks require an actual sacrifice)
    wp_before = _cp_to_win_prob(score_before)
    if (moving_value >= 900
            and not captured_piece
            and not piece_hanging
            and wp_before < 0.80):
        return True, False

    return False, False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_lines(board: chess.Board, infos: list[dict]) -> list[dict]:
    lines = []
    for info in infos:
        pv = info.get("pv", [])
        if not pv:
            continue
        # Convert up to 8 PV moves to SAN on a temporary board copy
        tmp = board.copy()
        san_moves: list[str] = []
        for move in pv[:17]:
            try:
                san_moves.append(tmp.san(move))
                tmp.push(move)
            except Exception:
                break
        score = _normalise_score(info["score"], board.turn)
        eval_white = score if board.turn == chess.WHITE else -score
        lines.append({"san": san_moves[0] if san_moves else "", "moves": san_moves, "eval": eval_white})
    return lines


def _accuracy(cp_losses: list[int]) -> float:
    if not cp_losses:
        return 1.0
    avg = sum(min(cp, 600) for cp in cp_losses) / len(cp_losses)
    return math.exp(-0.003 * avg)


_ELO_BREAKPOINTS = [
    (100.0, 3000),
    (95.0,  2500),
    (90.0,  2000),
    (85.0,  1700),
    (80.0,  1400),
    (75.0,  1100),
    (70.0,   800),
    (60.0,   400),
    (0.0,    100),
]


def _elo_from_accuracy(accuracy: float) -> int:
    pct = accuracy * 100
    for i in range(len(_ELO_BREAKPOINTS) - 1):
        hi_pct, hi_elo = _ELO_BREAKPOINTS[i]
        lo_pct, lo_elo = _ELO_BREAKPOINTS[i + 1]
        if pct >= lo_pct:
            t = (pct - lo_pct) / (hi_pct - lo_pct)
            raw = int(lo_elo + t * (hi_elo - lo_elo))
            return round(raw / 50) * 50
    return 100


def best_move(fen: str, depth: int = 15) -> dict[str, Any]:
    """Return the engine's best move for the given position (used for play-vs-engine)."""
    board = chess.Board(fen)
    if board.is_game_over():
        return {"move": None, "san": None, "from_sq": None, "to_sq": None, "fen": fen}
    limit = chess.engine.Limit(depth=depth)
    with _eval_lock:
        engine = _get_eval_engine()
        result = engine.play(board, limit)
    move = result.move
    san  = board.san(move)
    board.push(move)
    return {
        "move":    move.uci(),
        "san":     san,
        "from_sq": chess.square_name(move.from_square),
        "to_sq":   chess.square_name(move.to_square),
        "fen":     board.fen(),
    }


def eval_position(fen: str, depth: int = 20) -> dict[str, Any]:
    """Evaluate a single position to the given depth for interactive analysis.
    Uses a persistent engine instance to avoid per-request startup overhead."""
    board = chess.Board(fen)
    limit = chess.engine.Limit(depth=depth)
    with _eval_lock:
        engine = _get_eval_engine()
        infos: list[dict] = engine.analyse(board, limit, multipv=3)
    actual_depth = infos[0].get("depth", depth)
    score = _normalise_score(infos[0]["score"], board.turn)
    eval_white = score if board.turn == chess.WHITE else -score
    return {
        "eval": eval_white,
        "top_lines": _extract_lines(board, infos),
        "is_white_to_move": board.turn == chess.WHITE,
        "depth": actual_depth,
    }


def _normalise_score(score: chess.engine.PovScore, turn: chess.Color) -> int:
    pov = score.pov(turn)
    if pov.is_mate():
        mate_in = pov.mate()
        # Encode mate distance: 10000 + n = mate in n, -10000 - n = mated in n
        return (10000 + abs(mate_in)) if mate_in > 0 else (-10000 - abs(mate_in))
    return pov.score()  # type: ignore[return-value]
