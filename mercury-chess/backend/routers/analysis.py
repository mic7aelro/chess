from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.engine import analyse_game, eval_position

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class PgnRequest(BaseModel):
    pgn: str


class FenRequest(BaseModel):
    fen: str
    time: float = 0.3


@router.post("/")
def analyse(body: PgnRequest):
    try:
        result = analyse_game(body.pgn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/eval")
def eval_fen(body: FenRequest):
    try:
        result = eval_position(body.fen, body.time)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
