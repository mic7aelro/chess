import asyncio
import json
import threading

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.engine import analyse_game, eval_position, best_move, get_opening

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class PgnRequest(BaseModel):
    pgn: str


class FenRequest(BaseModel):
    fen: str
    depth: int = 20


@router.post("/")
def analyse(body: PgnRequest):
    try:
        result = analyse_game(body.pgn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/stream")
async def stream_analyse(body: PgnRequest):
    """SSE endpoint that streams progress then the final result."""
    loop = asyncio.get_event_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def on_progress(analyzed: int, total: int):
        loop.call_soon_threadsafe(
            queue.put_nowait,
            {"type": "progress", "analyzed": analyzed, "total": total},
        )

    def run():
        try:
            result = analyse_game(body.pgn, on_progress)
            loop.call_soon_threadsafe(
                queue.put_nowait, {"type": "complete", "result": result}
            )
        except Exception as exc:
            loop.call_soon_threadsafe(
                queue.put_nowait, {"type": "error", "detail": str(exc)}
            )

    threading.Thread(target=run, daemon=True).start()

    async def generate():
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=10.0)
            except asyncio.TimeoutError:
                # Engine is taking too long on one position — send a keepalive
                # so the client knows we're still alive, then keep waiting
                yield "data: {\"type\": \"keepalive\"}\n\n"
                continue
            yield f"data: {json.dumps(item)}\n\n"
            if item["type"] in ("complete", "error"):
                break

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/eval")
def eval_fen(body: FenRequest):
    try:
        result = eval_position(body.fen, body.depth)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/opening")
def opening(body: FenRequest):
    try:
        return get_opening(body.fen)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/best-move")
def get_best_move(body: FenRequest):
    try:
        result = best_move(body.fen, body.depth)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result
