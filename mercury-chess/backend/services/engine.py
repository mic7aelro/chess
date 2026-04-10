import chess
import chess.engine
import chess.pgn
import io
import json as _json
import math
import urllib.parse
import urllib.request
from typing import Any

STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
# Time-based limit: ~0.2 s/position → 40-move game ≈ 8 s total (vs minutes at depth 18)
ANALYSIS_LIMIT = chess.engine.Limit(time=0.2)
QUICK_LIMIT    = chess.engine.Limit(time=0.3)   # for interactive eval requests

_PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 300,
    chess.BISHOP: 300,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


def _fetch_opening(fen: str) -> dict | None:
    """Query Lichess Masters opening explorer for the given FEN.
    Returns {'name': str, 'eco': str} if position is in the book, else None."""
    url = (
        "https://explorer.lichess.ovh/masters"
        f"?fen={urllib.parse.quote(fen)}&moves=1&topGames=0&recentGames=0"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MercuryChess/1.0"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = _json.loads(resp.read())
        if not data.get("moves"):
            return None
        opening = data.get("opening") or {}
        if not opening.get("name"):
            return None
        return {"name": opening["name"], "eco": opening.get("eco", "")}
    except Exception:
        return None


def _collect_book_moves(game: chess.pgn.Game) -> tuple[dict[int, dict], dict | None]:
    """Walk game positions and fetch opening data until out of theory.
    Returns (book_by_ply, last_opening) where book_by_ply maps ply → opening info."""
    board = game.board()
    book_by_ply: dict[int, dict] = {}
    last_opening: dict | None = None

    for i, node in enumerate(game.mainline()):
        if i >= 40:          # cap — virtually no game leaves book after move 20
            break
        info = _fetch_opening(board.fen())
        board.push(node.move)
        if info is None:
            break
        book_by_ply[board.ply()] = info
        last_opening = info

    return book_by_ply, last_opening


def parse_pgn(pgn_text: str) -> chess.pgn.Game:
    game = chess.pgn.read_game(io.StringIO(pgn_text))
    if game is None:
        raise ValueError("Invalid PGN")
    return game


def analyse_game(pgn_text: str) -> dict[str, Any]:
    game = parse_pgn(pgn_text)

    headers = dict(game.headers)
    moves: list[dict] = []
    starting_fen = game.board().fen()

    # Fetch opening book data before starting Stockfish (separate HTTP calls)
    book_by_ply, last_opening = _collect_book_moves(game)

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        board = game.board()

        prev_infos: list[dict] = engine.analyse(
            board, ANALYSIS_LIMIT, multipv=3
        )
        prev_score = _normalise_score(prev_infos[0]["score"], board.turn)
        initial_lines = _extract_lines(board, prev_infos)

        for node in game.mainline():
            move = node.move
            san = board.san(move)
            turn = board.turn
            from_sq = chess.square_name(move.from_square)
            to_sq = chess.square_name(move.to_square)

            score_before = prev_score  # best available from moving side's POV

            # Surprise: played move not in engine's top suggestions
            prev_top_sans = {
                board.san(info["pv"][0])
                for info in prev_infos
                if info.get("pv")
            }
            surprise = san not in prev_top_sans

            # Only-move: gap between best and second-best is large
            is_only_move = False
            if len(prev_infos) >= 2 and prev_infos[1].get("pv"):
                second_score = _normalise_score(prev_infos[1]["score"], turn)
                wp_gap = _cp_to_win_prob(score_before) - _cp_to_win_prob(second_score)
                is_only_move = wp_gap > 0.15

            brilliant = _is_brilliant(board, move, surprise)

            # Alt lines: engine's top suggestions from THIS position, excluding the played move
            alt_lines = [
                line for line in _extract_lines(board, prev_infos)
                if line["san"] != san
            ][:2]

            board.push(move)

            is_book = board.ply() in book_by_ply
            book_info = book_by_ply.get(board.ply(), {})

            infos: list[dict] = engine.analyse(
                board, ANALYSIS_LIMIT, multipv=3
            )
            score_opponent = _normalise_score(infos[0]["score"], board.turn)
            score_mover = -score_opponent

            cp_loss = max(0, score_before - score_mover)
            eval_white = score_mover if turn == chess.WHITE else -score_mover
            classification = (
                "book" if is_book
                else _classify(score_before, score_mover, brilliant, is_only_move)
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
    if cp >= 10000:
        return 1.0
    if cp <= -10000:
        return 0.0
    return 1.0 / (1.0 + 10.0 ** (-cp / 400.0))


def _classify(
    score_before: int,   # best eval from moving side's POV (pre-move)
    score_mover: int,    # eval for moving side after the played move
    brilliant: bool,
    is_only_move: bool,
) -> str:
    wp_best   = _cp_to_win_prob(score_before)
    wp_played = _cp_to_win_prob(score_mover)
    expected_loss = max(0.0, wp_best - wp_played)

    # Miss: had a winning advantage but failed to capitalise
    if expected_loss >= 0.20 and wp_best >= 0.85 and wp_played < 0.75:
        return "miss"

    # Brilliant: surprise piece sacrifice that's still best/excellent
    if brilliant and expected_loss < 0.02 and wp_best < 0.90:
        return "brilliant"

    # Great: the only viable resource in a critical position
    if is_only_move and expected_loss < 0.02:
        return "great"

    # Standard win-probability thresholds (Chess.com model)
    if expected_loss < 0.005:
        return "best"
    if expected_loss < 0.02:
        return "excellent"
    if expected_loss < 0.05:
        return "good"
    if expected_loss < 0.10:
        return "inaccuracy"
    if expected_loss < 0.20:
        return "mistake"
    return "blunder"


def _is_brilliant(board: chess.Board, move: chess.Move, surprise: bool) -> bool:
    if not surprise:
        return False
    moving_piece = board.piece_at(move.from_square)
    if moving_piece is None:
        return False
    moving_value = _PIECE_VALUES.get(moving_piece.piece_type, 0)
    if moving_value < 300:
        return False
    captured_piece = board.piece_at(move.to_square)
    captured_value = _PIECE_VALUES.get(captured_piece.piece_type, 0) if captured_piece else 0
    board_copy = board.copy()
    board_copy.push(move)
    piece_hanging = board_copy.is_attacked_by(board_copy.turn, move.to_square)
    return piece_hanging and captured_value < moving_value


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
        for move in pv[:8]:
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
            return int(lo_elo + t * (hi_elo - lo_elo))
    return 100


def eval_position(fen: str, time: float = 0.3) -> dict[str, Any]:
    """Quick evaluation of a single position for interactive analysis."""
    board = chess.Board(fen)
    limit = chess.engine.Limit(time=time)
    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        infos: list[dict] = engine.analyse(board, limit, multipv=3)
    score = _normalise_score(infos[0]["score"], board.turn)
    eval_white = score if board.turn == chess.WHITE else -score
    return {
        "eval": eval_white,
        "top_lines": _extract_lines(board, infos),
        "is_white_to_move": board.turn == chess.WHITE,
    }


def _normalise_score(score: chess.engine.PovScore, turn: chess.Color) -> int:
    pov = score.pov(turn)
    if pov.is_mate():
        mate_in = pov.mate()
        return 10000 if mate_in > 0 else -10000
    return pov.score()  # type: ignore[return-value]
