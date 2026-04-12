from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.analysis import router as analysis_router
from routers.library import router as library_router
from routers.repertoire import router as repertoire_router

app = FastAPI(title="Mercury Chess API")

import os
_cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router)
app.include_router(library_router)
app.include_router(repertoire_router)


@app.on_event("startup")
async def create_indexes():
    from db import get_db
    db = get_db()
    # Drop legacy unique index on (fen, color) that prevented multiple moves per position
    try:
        await db["repertoire"].drop_index("fen_1_color_1")
    except Exception:
        pass
    await db["repertoire"].create_index(
        [("fen", 1), ("move", 1), ("color", 1)], unique=True
    )


@app.get("/health")
def health():
    return {"status": "ok"}
