"""FastAPI application entry point."""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from sqlalchemy import inspect, text

from app.database import Base, engine
from app.routers import setlists, transitions
from app.spotify import SpotifyUnavailableError

STATIC_DIR = Path(__file__).parent / "static"
UI_INDEX = STATIC_DIR / "ui" / "index.html"
UI_NOT_BUILT_HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Not built</title>
<style>body{background:#0f0f12;color:#f0f0f5;font-family:system-ui,sans-serif;
padding:3rem;line-height:1.6}code{background:#1a1a22;border:1px solid #2e2e3a;
border-radius:6px;padding:.15rem .4rem}</style></head>
<body><h1>This view is not built yet</h1>
<p>Build the React app once, then reload this page:</p>
<p><code>make ui</code></p></body></html>"""


ADDED_COLUMNS = {
    "transitions": {"bidirectional": "BOOLEAN NOT NULL DEFAULT FALSE"},
    "tracks": {"default_key": "VARCHAR(3)", "default_bpm": "DOUBLE PRECISION"},
}


def _migrate() -> None:
    """Create any missing tables, then add columns that older databases lack."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    for table, additions in ADDED_COLUMNS.items():
        if table not in tables:
            continue
        existing = {column["name"] for column in inspector.get_columns(table)}
        for column, definition in additions.items():
            if column in existing:
                continue
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                )


@asynccontextmanager
async def lifespan(_: FastAPI):
    _migrate()
    yield


app = FastAPI(title="Crossfade", lifespan=lifespan)
app.include_router(transitions.router)
app.include_router(setlists.router)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.exception_handler(SpotifyUnavailableError)
def spotify_unavailable(_: Request, exc: SpotifyUnavailableError) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


def _single_page_app() -> Response:
    """One React bundle backs every route below; the router picks the view."""
    if not UI_INDEX.exists():
        return HTMLResponse(UI_NOT_BUILT_HTML, status_code=503)
    return FileResponse(UI_INDEX)


@app.get("/graph", response_class=HTMLResponse)
def graph() -> Response:
    return _single_page_app()


@app.get("/setlists", response_class=HTMLResponse)
@app.get("/setlists/{path:path}", response_class=HTMLResponse)
def set_lists() -> Response:
    return _single_page_app()
