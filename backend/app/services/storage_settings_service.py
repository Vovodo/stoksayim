"""Supabase Storage ayarları ve veritabanı durum servisi."""

from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from app.repositories.sqlite_repository import SQLiteSessionRepository
from app.services.file_storage import (
    STORAGE_LOCAL,
    STORAGE_SUPABASE,
    SupabaseFileStorage,
)

STORAGE_SUPABASE_URL = "storage.supabase_url"
STORAGE_SUPABASE_SERVICE_ROLE_KEY = "storage.supabase_service_role_key"
STORAGE_SUPABASE_BUCKET = "storage.supabase_storage_bucket"
STORAGE_LAST_STATUS = "storage.last_status"
STORAGE_LAST_ERROR = "storage.last_error"
STORAGE_LAST_CHECK_AT = "storage.last_check_at"

StorageStatus = Literal["disabled", "ready", "error"]


def mask_key(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    val = key.strip()
    if len(val) <= 8:
        return "********"
    return f"{val[:4]}...{val[-4:]}"


class StorageSettingsService:
    def __init__(self, repo: SQLiteSessionRepository):
        self.repo = repo

    async def get_url(self) -> Optional[str]:
        val = await self.repo.get_setting(STORAGE_SUPABASE_URL)
        if val:
            return val.strip()
        env_val = os.getenv("SUPABASE_URL", "")
        return env_val.strip() if env_val.strip() else None

    async def get_service_role_key(self) -> Optional[str]:
        val = await self.repo.get_setting(STORAGE_SUPABASE_SERVICE_ROLE_KEY)
        if val:
            return val.strip()
        env_val = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        return env_val.strip() if env_val.strip() else None

    async def get_bucket(self) -> Optional[str]:
        val = await self.repo.get_setting(STORAGE_SUPABASE_BUCKET)
        if val:
            return val.strip()
        env_val = os.getenv("SUPABASE_STORAGE_BUCKET", "")
        if env_val and env_val.strip():
            return env_val.strip()
        return None

    async def is_configured(self) -> bool:
        return bool(
            await self.get_url()
            and await self.get_service_role_key()
            and await self.get_bucket()
        )

    async def get_supabase_storage(self) -> Optional[SupabaseFileStorage]:
        url = await self.get_url()
        key = await self.get_service_role_key()
        bucket = await self.get_bucket()
        if not url or not key or not bucket:
            return None
        return SupabaseFileStorage(
            project_url=url,
            service_role_key=key,
            bucket=bucket,
        )

    async def _set_status(self, status: StorageStatus, error: Optional[str] = None) -> None:
        await self.repo.set_setting(STORAGE_LAST_STATUS, status)
        await self.repo.set_setting(STORAGE_LAST_CHECK_AT, datetime.now(timezone.utc).isoformat())
        if error:
            await self.repo.set_setting(STORAGE_LAST_ERROR, error[:500])
        elif status == "ready":
            await self.repo.set_setting(STORAGE_LAST_ERROR, None)

    async def get_public_settings(self) -> dict:
        url = await self.get_url()
        bucket = await self.get_bucket()
        key = await self.get_service_role_key()
        configured = bool(url and key and bucket)
        status_raw = await self.repo.get_setting(STORAGE_LAST_STATUS)
        status: StorageStatus = "disabled"
        if configured:
            status = status_raw if status_raw in ("ready", "error") else "ready"
        return {
            "configured": configured,
            "supabase_url": url,
            "storage_bucket": bucket,
            "service_role_key_masked": mask_key(key),
            "backend": STORAGE_SUPABASE if configured else STORAGE_LOCAL,
            "status": status,
            "last_error": await self.repo.get_setting(STORAGE_LAST_ERROR),
            "last_check_at": await self.repo.get_setting(STORAGE_LAST_CHECK_AT),
        }

    async def save_settings(
        self,
        *,
        supabase_url: Optional[str] = None,
        service_role_key: Optional[str] = None,
        clear_service_role_key: bool = False,
        storage_bucket: Optional[str] = None,
    ) -> None:
        if supabase_url is not None:
            text = supabase_url.strip()
            if text:
                if not text.startswith("http"):
                    text = f"https://{text.lstrip('/')}"
                await self.repo.set_setting(STORAGE_SUPABASE_URL, text.rstrip("/"))
            else:
                await self.repo.delete_setting(STORAGE_SUPABASE_URL)

        if clear_service_role_key:
            await self.repo.delete_setting(STORAGE_SUPABASE_SERVICE_ROLE_KEY)
        elif service_role_key is not None and service_role_key.strip():
            await self.repo.set_setting(STORAGE_SUPABASE_SERVICE_ROLE_KEY, service_role_key.strip())

        if storage_bucket is not None:
            text = storage_bucket.strip()
            if text:
                await self.repo.set_setting(STORAGE_SUPABASE_BUCKET, text)
            else:
                await self.repo.delete_setting(STORAGE_SUPABASE_BUCKET)

        if await self.is_configured():
            await self._set_status("ready")
        else:
            await self._set_status("disabled")

    async def test_connection(self) -> str:
        storage = await self.get_supabase_storage()
        if not storage:
            raise ValueError("Supabase Storage ayarları eksik. URL, service role key ve bucket girin.")

        probe_key = f"healthcheck_{uuid.uuid4().hex}.txt"
        payload = b"storage-healthcheck"
        try:
            await storage.save(probe_key, payload, "text/plain")
            data = await storage.read(probe_key)
            if data != payload:
                raise RuntimeError("Yüklenen test dosyası okunamadı.")
            await storage.delete(probe_key)
            await self._set_status("ready")
            bucket = await self.get_bucket()
            return f"Supabase Storage bağlantısı başarılı (bucket: '{bucket}')."
        except Exception as exc:
            await self._set_status("error", str(exc))
            raise
