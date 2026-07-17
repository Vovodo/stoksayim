from abc import ABC, abstractmethod
from typing import Any, Optional


class StockRepository(ABC):
    """Excel/DB stok verisi soyut katmanı."""

    @abstractmethod
    def load_from_excel(self, file_path: str) -> dict[str, Any]:
        ...

    @abstractmethod
    def get_etiket(self, etiket: str) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    def get_shelves(self) -> list[str]:
        ...

    @abstractmethod
    def get_shelf_items(self, shelf: str) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def get_metadata(self) -> dict[str, Any]:
        ...


class SessionRepository(ABC):
    """Sayım oturumu kalıcılık soyut katmanı."""

    @abstractmethod
    async def create_session(self, name: str, user_id: int, excel_filename: str) -> int:
        ...

    @abstractmethod
    async def get_active_session(self) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    async def end_session(self, session_id: int) -> None:
        ...

    @abstractmethod
    async def set_active_shelf(self, session_id: int, shelf: str) -> None:
        ...

    @abstractmethod
    async def record_scan(
        self,
        session_id: int,
        user_id: int,
        etiket: str,
        shelf: str,
        scan_type: str,
        expected: float,
        scanned: float,
    ) -> None:
        ...

    @abstractmethod
    async def get_scan_counts(self, session_id: int) -> dict[tuple[str, str], float]:
        ...

    @abstractmethod
    async def get_unknown_items(self, session_id: int) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def get_unassigned_found(self, session_id: int) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    async def add_audit_log(
        self, user_id: int, action: str, details: str
    ) -> None:
        ...

    @abstractmethod
    async def get_audit_logs(self, session_id: Optional[int] = None) -> list[dict]:
        ...
