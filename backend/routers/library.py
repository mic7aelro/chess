from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from db import get_db

router = APIRouter(prefix="/library", tags=["library"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _oid(id_str: str) -> ObjectId:
    try:
        return ObjectId(id_str)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid id: {id_str}")


def _fmt_folder(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "createdAt": int(doc["createdAt"].timestamp() * 1000),
    }


def _fmt_game(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "folderId": str(doc["folderId"]) if doc.get("folderId") else None,
        "name": doc.get("name", ""),
        "pgn": doc.get("pgn", ""),
        "white": doc.get("white"),
        "black": doc.get("black"),
        "date": doc.get("date"),
        "savedAt": int(doc["savedAt"].timestamp() * 1000),
        "analysisId": str(doc["analysisId"]) if doc.get("analysisId") else None,
    }


def _fmt_game_with_result(game: dict, analysis: dict | None) -> dict:
    out = _fmt_game(game)
    if analysis:
        out["result"] = analysis.get("result")
    return out


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str


@router.get("/folders")
async def list_folders():
    db = get_db()
    docs = await db["folders"].find().sort("createdAt", 1).to_list(length=None)
    return [_fmt_folder(d) for d in docs]


@router.post("/folders", status_code=201)
async def create_folder(body: FolderCreate):
    db = get_db()
    doc = {"name": body.name.strip(), "createdAt": datetime.now(timezone.utc)}
    result = await db["folders"].insert_one(doc)
    doc["_id"] = result.inserted_id
    return _fmt_folder(doc)


@router.patch("/folders/{folder_id}")
async def rename_folder(folder_id: str, body: FolderRename):
    db = get_db()
    res = await db["folders"].update_one(
        {"_id": _oid(folder_id)},
        {"$set": {"name": body.name.strip()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Folder not found")
    return {"ok": True}


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str):
    db = get_db()
    oid = _oid(folder_id)
    # Find games in this folder, then delete their analyses
    game_docs = await db["games"].find({"folderId": oid}, {"analysisId": 1}).to_list(length=None)
    analysis_ids = [g["analysisId"] for g in game_docs if g.get("analysisId")]
    if analysis_ids:
        await db["analyses"].delete_many({"_id": {"$in": analysis_ids}})
    await db["games"].delete_many({"folderId": oid})
    await db["folders"].delete_one({"_id": oid})


# ---------------------------------------------------------------------------
# Games (with embedded analysis)
# ---------------------------------------------------------------------------

class GameSave(BaseModel):
    folderId: str | None = None
    name: str
    pgn: str
    white: str | None = None
    black: str | None = None
    date: str | None = None
    result: Any  # full AnalysisResult JSON


class GameRename(BaseModel):
    name: str


@router.get("/games")
async def list_games():
    db = get_db()
    games = await db["games"].find().sort("savedAt", -1).to_list(length=None)
    # Batch-fetch analyses
    analysis_ids = [g["analysisId"] for g in games if g.get("analysisId")]
    analyses_by_id: dict[str, dict] = {}
    if analysis_ids:
        docs = await db["analyses"].find({"_id": {"$in": analysis_ids}}).to_list(length=None)
        for d in docs:
            analyses_by_id[str(d["_id"])] = d
    return [
        _fmt_game_with_result(g, analyses_by_id.get(str(g.get("analysisId"))))
        for g in games
    ]


@router.post("/games", status_code=201)
async def save_game(body: GameSave):
    db = get_db()

    # Store heavy analysis data separately
    analysis_doc = {
        "result": body.result,
        "analyzedAt": datetime.now(timezone.utc),
    }
    analysis_res = await db["analyses"].insert_one(analysis_doc)

    game_doc: dict[str, Any] = {
        "name": body.name,
        "pgn": body.pgn,
        "savedAt": datetime.now(timezone.utc),
        "analysisId": analysis_res.inserted_id,
    }
    if body.folderId:
        game_doc["folderId"] = _oid(body.folderId)
    if body.white:
        game_doc["white"] = body.white
    if body.black:
        game_doc["black"] = body.black
    if body.date:
        game_doc["date"] = body.date

    game_res = await db["games"].insert_one(game_doc)
    game_doc["_id"] = game_res.inserted_id
    analysis_doc["_id"] = analysis_res.inserted_id

    return _fmt_game_with_result(game_doc, analysis_doc)


@router.patch("/games/{game_id}")
async def rename_game(game_id: str, body: GameRename):
    db = get_db()
    res = await db["games"].update_one(
        {"_id": _oid(game_id)},
        {"$set": {"name": body.name.strip()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Game not found")
    return {"ok": True}


@router.delete("/games/{game_id}", status_code=204)
async def delete_game(game_id: str):
    db = get_db()
    oid = _oid(game_id)
    game = await db["games"].find_one({"_id": oid}, {"analysisId": 1})
    if game and game.get("analysisId"):
        await db["analyses"].delete_one({"_id": game["analysisId"]})
    await db["games"].delete_one({"_id": oid})


@router.put("/games/{game_id}/analysis")
async def update_game_analysis(game_id: str, body: dict):
    """Replace the analysis result for an existing game (re-analyse)."""
    db = get_db()
    oid = _oid(game_id)
    game = await db["games"].find_one({"_id": oid}, {"analysisId": 1})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    result = body.get("result")
    if game.get("analysisId"):
        await db["analyses"].update_one(
            {"_id": game["analysisId"]},
            {"$set": {"result": result, "analyzedAt": datetime.now(timezone.utc)}},
        )
    else:
        analysis_res = await db["analyses"].insert_one({
            "result": result,
            "analyzedAt": datetime.now(timezone.utc),
        })
        await db["games"].update_one(
            {"_id": oid},
            {"$set": {"analysisId": analysis_res.inserted_id}},
        )
    return {"ok": True}
