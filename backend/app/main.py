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


async def _load_persisted_excel() -> None:
    """Diskteki veya Supabase Storage'daki aktif/son Excel dosyasını RAM cache'e yükle (startup)."""
    if stock_repo.is_loaded():
        logger.info("Excel RAM cache zaten yüklü — startup atlandı.")
        return

    # 1. Öncelik: Aktif oturumun Excel dosyası veya son yüklenen Excel adı
    target_filename: Optional[str] = None
    try:
        active_session = await session_repo.get_active_session()
        if active_session and active_session.get("excel_filename"):
            target_filename = active_session.get("excel_filename")
        if not target_filename:
            target_filename = await session_repo.get_setting("latest_excel_filename")
    except Exception as exc:
        logger.warning("Startup veritabanından Excel adı sorgulama hatası: %s", exc)

    # 2. Eğer hedef dosya biliniyorsa, önce diskte var mı bak, yoksa Supabase Storage'dan indir
    if target_filename:
        dest = settings.upload_dir / target_filename
        if not dest.is_file():
            try:
                from app.services.storage_settings_service import StorageSettingsService
                storage_svc = StorageSettingsService(session_repo)
                supabase_storage = await storage_svc.get_supabase_storage()
                if supabase_storage:
                    excel_bytes = await supabase_storage.read(f"excel/{target_filename}")
                    if not excel_bytes:
                        excel_bytes = await supabase_storage.read(target_filename)
                    if excel_bytes:
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        dest.write_bytes(excel_bytes)
                        logger.info("Startup: Supabase Storage'dan Excel indirildi ve senkronize edildi: %s", target_filename)
            except Exception as exc:
                logger.warning("Startup Supabase Storage indirme hatası (%s): %s", target_filename, exc)

        if dest.is_file():
            try:
                stock_repo.load_from_excel(str(dest))
                meta = stock_repo.get_metadata()
                logger.info(
                    "Startup Hedef Excel RAM cache'e yüklendi: %s (%d etiket, %d raf)",
                    dest.name,
                    meta.get("etiket_count", 0),
                    meta.get("shelf_count", 0),
                )
                return
            except Exception as exc:
                logger.error("Startup Hedef Excel okunamadı (%s): %s", dest.name, exc)

    # 3. Yedeğe geç: Diskte bulunan herhangi bir .xlsx / .xls dosyası (tarihe göre en son)
    uploads = sorted(
        list(settings.upload_dir.glob("*.xlsx")) + list(settings.upload_dir.glob("*.xls")),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )

    if not uploads and target_filename is None:
        try:
            from app.services.storage_settings_service import StorageSettingsService
            storage_svc = StorageSettingsService(session_repo)
            supabase_storage = await storage_svc.get_supabase_storage()
            latest_filename = await session_repo.get_setting("latest_excel_filename")
            if supabase_storage and latest_filename:
                excel_bytes = await supabase_storage.read(f"excel/{latest_filename}")
                if not excel_bytes:
                    excel_bytes = await supabase_storage.read(latest_filename)
                if excel_bytes:
                    dest = settings.upload_dir / latest_filename
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(excel_bytes)
                    uploads = [dest]
                    logger.info("Startup: Supabase Storage'dan son Excel indirildi: %s", latest_filename)
        except Exception as exc:
            logger.warning("Startup genel Supabase Excel indirme hatası: %s", exc)

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

    @app.api_route("/", methods=["GET", "HEAD"], include_in_schema=False)
    async def serve_index_root() -> FileResponse:
        return FileResponse(index_file)

    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
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
    await _load_persisted_excel()
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


# UptimeRobot & Health Check Endpoints (GET and HEAD supported)

@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"status": "ok"}


@app.api_route("/api/health", methods=["GET", "HEAD"])
async def api_health():
    meta = count_service.stock.get_metadata() if count_service.stock.is_loaded() else {}
    return {
        "status": "ok",
        "excel_loaded": count_service.stock.is_loaded(),
        "environment": settings.environment,
        "cache_mode": meta.get("cache_mode", "none"),
        "etiket_count": meta.get("etiket_count", 0),
    }


@app.api_route("/ping", methods=["GET", "HEAD"])
@app.api_route("/api/ping", methods=["GET", "HEAD"])
async def ping():
    return Response(content="pong", media_type="text/plain", status_code=200)


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
