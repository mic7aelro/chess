from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db

router = APIRouter(prefix="/repertoire", tags=["repertoire"])


def normalise_fen(fen: str) -> str:
    """Strip halfmove clock and fullmove number so transpositions share the same key."""
    parts = fen.split()
    return " ".join(parts[:4])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class MoveAdd(BaseModel):
    fen: str
    move: str            # UCI (e.g. "e2e4")
    san: str             # display (e.g. "e4")
    color: str           # "white" | "black" — which repertoire this belongs to
    is_player_move: bool = True
    notes: str = ""


class MoveDelete(BaseModel):
    fen: str
    move: str            # UCI — needed to identify exact move (multiple per position allowed)
    color: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("")
async def get_repertoire(color: str):
    """Return all moves for a color as a flat list (player + opponent moves)."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")
    db = get_db()
    docs = await db["repertoire"].find({"color": color}).to_list(length=None)
    return [_fmt(d) for d in docs]


@router.post("", status_code=201)
async def add_move(body: MoveAdd):
    """Save a repertoire move. Unique per (fen, move, color) — multiple moves per position allowed."""
    if body.color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")
    db = get_db()
    fen = normalise_fen(body.fen)
    doc = {
        "fen": fen,
        "move": body.move,
        "san": body.san,
        "color": body.color,
        "isPlayerMove": body.is_player_move,
        "notes": body.notes,
        "addedAt": datetime.now(timezone.utc),
    }
    await db["repertoire"].update_one(
        {"fen": fen, "move": body.move, "color": body.color},
        {"$set": doc},
        upsert=True,
    )
    result = await db["repertoire"].find_one({"fen": fen, "move": body.move, "color": body.color})
    return _fmt(result)


@router.delete("", status_code=204)
async def delete_move(body: MoveDelete):
    """Remove a specific move (identified by fen + move UCI + color)."""
    db = get_db()
    await db["repertoire"].delete_one({
        "fen": normalise_fen(body.fen),
        "move": body.move,
        "color": body.color,
    })


@router.post("/import")
async def import_from_games(color: str):
    """Scan saved games and extract opening moves for the given color."""
    if color not in ("white", "black"):
        raise HTTPException(status_code=400, detail="color must be 'white' or 'black'")

    import chess
    import chess.pgn
    import io

    db = get_db()
    games = await db["games"].find(
        {color: {"$exists": True}},
        {"pgn": 1, "white": 1, "black": 1},
    ).to_list(length=None)

    candidates: dict[str, dict] = {}

    for game_doc in games:
        pgn = game_doc.get("pgn", "")
        if not pgn:
            continue
        try:
            game = chess.pgn.read_game(io.StringIO(pgn))
        except Exception:
            continue
        if game is None:
            continue

        player_is_white = color == "white"
        board = game.board()
        for i, node in enumerate(game.mainline()):
            if i >= 30:
                break
            is_white_turn = board.turn == chess.WHITE
            if is_white_turn != player_is_white:
                board.push(node.move)
                continue

            fen_key = normalise_fen(board.fen())
            san = board.san(node.move)

            if fen_key not in candidates:
                candidates[fen_key] = {
                    "fen": fen_key,
                    "move": node.move.uci(),
                    "san": san,
                    "color": color,
                    "count": 0,
                }
            candidates[fen_key]["count"] += 1
            board.push(node.move)

    return sorted(candidates.values(), key=lambda x: -x["count"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "fen": doc["fen"],
        "move": doc["move"],
        "san": doc["san"],
        "color": doc["color"],
        "isPlayerMove": doc.get("isPlayerMove", True),
        "notes": doc.get("notes", ""),
        "addedAt": int(doc["addedAt"].timestamp() * 1000),
    }
