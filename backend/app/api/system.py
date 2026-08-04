import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user, session_repo
from app.models.schemas import SystemEventResponse
from app.services.storage_settings_service import StorageSettingsService

router = APIRouter(prefix="/system", tags=["system"])


class StorageSettingsUpdate(BaseModel):
    supabase_url: Optional[str] = Field(None, max_length=512)
    service_role_key: Optional[str] = Field(None, max_length=1024)
    clear_service_role_key: bool = False
    storage_bucket: Optional[str] = Field(None, max_length=128)


@router.get("/logs", response_model=list[SystemEventResponse])
async def system_logs(user: dict = Depends(get_current_user)):
    rows = await session_repo.get_system_events()
    return [
        SystemEventResponse(
            id=r["id"],
            username=r["username"],
            action=r["action"],
            filename=r.get("filename"),
            details=r["details"],
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.get("/storage")
async def get_storage_settings(user: dict = Depends(get_current_user)):
    service = StorageSettingsService(session_repo)
    return await service.get_public_settings()


@router.post("/storage")
async def update_storage_settings(
    body: StorageSettingsUpdate,
    user: dict = Depends(get_current_user),
):
    service = StorageSettingsService(session_repo)
    await service.save_settings(
        supabase_url=body.supabase_url,
        service_role_key=body.service_role_key,
        clear_service_role_key=body.clear_service_role_key,
        storage_bucket=body.storage_bucket,
    )
    await session_repo.add_system_event(
        user["id"],
        "storage_settings_update",
        f"Supabase Storage ayarları güncellendi ({user['username']})",
    )
    return await service.get_public_settings()


@router.post("/storage/test")
async def test_storage_connection(user: dict = Depends(get_current_user)):
    service = StorageSettingsService(session_repo)
    try:
        msg = await service.test_connection()
        await session_repo.add_system_event(
            user["id"],
            "storage_connection_test",
            f"Supabase Storage testi başarılı ({user['username']})",
        )
        return {"ok": True, "message": msg, "settings": await service.get_public_settings()}
    except Exception as exc:
        err_msg = str(exc)
        await session_repo.add_system_event(
            user["id"],
            "storage_connection_test_failed",
            f"Supabase Storage testi başarısız: {err_msg[:200]} ({user['username']})",
        )
        raise HTTPException(status_code=400, detail=f"Bağlantı başarısız: {err_msg}") from exc


@router.get("/db-status")
async def check_db_status(user: dict = Depends(get_current_user)):
    try:
        # Check SQLite or Postgres
        active_session = await session_repo.get_active_session()
        db_type = "PostgreSQL" if os.getenv("DATABASE_URL") else "SQLite (depo_sayim.db)"
        return {
            "status": "ready",
            "connected": True,
            "db_type": db_type,
            "active_session": active_session["name"] if active_session else None,
            "message": f"Veritabanı bağlantısı aktif ({db_type}).",
        }
    except Exception as exc:
        return {
            "status": "error",
            "connected": False,
            "db_type": "Bilinmeyen",
            "active_session": None,
            "message": f"Veritabanı hatası: {str(exc)}",
        }


class SoundSettingsPayload(BaseModel):
    successPreset: str = "bright"
    errorPreset: str = "sharp"
    successVolume: int = 100
    errorVolume: int = 100


@router.get("/sound-settings")
async def get_sound_settings(user: dict = Depends(get_current_user)):
    key = f"sound_settings:{user['username']}"
    val = await session_repo.get_setting(key)
    if not val:
        val = await session_repo.get_setting("sound_settings:default")
    if val:
        try:
            return json.loads(val)
        except Exception:
            pass
    return {
        "successPreset": "bright",
        "errorPreset": "sharp",
        "successVolume": 100,
        "errorVolume": 100,
    }


@router.post("/sound-settings")
async def update_sound_settings(
    body: SoundSettingsPayload,
    user: dict = Depends(get_current_user),
):
    key = f"sound_settings:{user['username']}"
    payload_str = json.dumps(body.model_dump())
    await session_repo.set_setting(key, payload_str)
    await session_repo.set_setting("sound_settings:default", payload_str)
    return body
