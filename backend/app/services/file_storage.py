"""Supabase Storage istemcisi ve yerel dosya depolama mantığı."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

STORAGE_LOCAL = "local"
STORAGE_SUPABASE = "supabase"


class SupabaseFileStorage:
    def __init__(
        self,
        *,
        project_url: str,
        service_role_key: str,
        bucket: str,
    ):
        self.project_url = project_url.rstrip("/")
        self.service_role_key = service_role_key.strip()
        self.bucket = bucket.strip()

    def _object_url(self, object_key: str) -> str:
        encoded = "/".join(quote(part, safe="") for part in object_key.split("/") if part)
        return f"{self.project_url}/storage/v1/object/{self.bucket}/{encoded}"

    async def save(self, object_key: str, content: bytes, mime_type: Optional[str] = None) -> None:
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "Content-Type": mime_type or "application/octet-stream",
            "x-upsert": "true",
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                self._object_url(object_key),
                content=content,
                headers=headers,
            )
            if response.status_code >= 400:
                detail = response.text[:300]
                raise RuntimeError(f"Supabase Storage yükleme hatası ({response.status_code}): {detail}")

    async def read(self, object_key: str) -> Optional[bytes]:
        headers = {"Authorization": f"Bearer {self.service_role_key}"}
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(self._object_url(object_key), headers=headers)
            if response.status_code == 404:
                return None
            if response.status_code >= 400:
                detail = response.text[:300]
                raise RuntimeError(f"Supabase Storage okuma hatası ({response.status_code}): {detail}")
            return response.content

    async def delete(self, object_key: str) -> None:
        headers = {"Authorization": f"Bearer {self.service_role_key}"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.delete(self._object_url(object_key), headers=headers)
            if response.status_code in (200, 204, 404):
                return
            detail = response.text[:300]
            raise RuntimeError(f"Supabase Storage silme hatası ({response.status_code}): {detail}")
