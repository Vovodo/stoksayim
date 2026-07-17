from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from app.api import auth, count, reports, system
from app.api.deps import count_service, session_repo, stock_repo, ws_connections
from app.config import settings
from app.core.logging import logger


def _load_persisted_excel() -> None:
    """Diskteki son Excel dosyasını bir kez RAM cache'e yükle (startup)."""
    if stock_repo.is_loaded():
        logger.info("Excel RAM cache zaten yüklü — startup atlandı.")
        return
    uploads = sorted(
        settings.upload_dir.glob("*.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not uploads:
        xls = sorted(
            settings.upload_dir.glob("*.xls"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        uploads = xls
    if not uploads:
        logger.info("Startup: uploads klasöründe Excel yok — cache boş.")
        return
    latest = uploads[0]
    try:
        stock_repo.load_from_excel(str(latest))
        meta = stock_repo.get_metadata()
        logger.info(
            "Startup Excel RAM cache: %s (%d etiket, %d raf)",
            latest.name,
            meta.get("etiket_count", 0),
            meta.get("shelf_count", 0),
        )
    except Exception as exc:
        logger.error(
            "Startup Excel yüklenemedi (%s): %s — API çalışmaya devam eder, Excel yükleyin.",
            latest.name,
            exc,
        )


def _mount_frontend(app: FastAPI) -> None:
    static_dir: Path = settings.static_dir
    if not static_dir.is_dir():
        logger.warning("Static klasör bulunamadı (%s) — yalnızca API modu.", static_dir)
        return

    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    index_file = static_dir / "index.html"
    if not index_file.is_file():
        logger.warning("index.html bulunamadı: %s", index_file)
        return

    @app.get("/", include_in_schema=False)
    async def serve_index_root() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> FileResponse:
        if full_path.startswith("api") or full_path == "ws":
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = static_dir / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index_file)

    logger.info("Frontend static servis ediliyor: %s", static_dir)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await session_repo.initialize()
    _load_persisted_excel()
    await count_service.reload_session_state()
    logger.info(
        "Depo Sayım başlatıldı (env=%s, data=%s, excel=%s, oturum=%s).",
        settings.environment,
        settings.data_dir,
        stock_repo.is_loaded(),
        count_service.active_session_id,
    )
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(auth.router, prefix="/api")
app.include_router(count.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(system.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.head("/health")
async def health_head():
    return Response(status_code=200)


@app.get("/api/health")
async def health():
    meta = count_service.stock.get_metadata() if count_service.stock.is_loaded() else {}
    return {
        "status": "ok",
        "excel_loaded": count_service.stock.is_loaded(),
        "environment": settings.environment,
        "cache_mode": meta.get("cache_mode", "none"),
        "etiket_count": meta.get("etiket_count", 0),
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_connections.append(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in ws_connections:
            ws_connections.remove(ws)


_mount_frontend(app)
