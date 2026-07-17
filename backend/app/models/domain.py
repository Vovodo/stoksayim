from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATOR = "operator"


class SessionStatus(str, Enum):
    IDLE = "idle"
    ACTIVE = "active"
    COMPLETED = "completed"


class ItemStatus(str, Enum):
    PENDING = "pending"
    COMPLETE = "complete"
    SHORT = "short"
    OVER = "over"


class ScanType(str, Enum):
    NORMAL = "normal"
    UNASSIGNED = "unassigned"
    UNKNOWN = "unknown"
    MISPLACED = "misplaced"
    IGNORED = "ignored"
    FOUND_MISSING = "found_missing"


class CountTrackingStatus(str, Enum):
    """Sayım satırı takip durumu — merkezi sabitler."""
    NORMAL = "NORMAL"
    OKUTULDU = "OKUTULDU"
    BULUNAMADI = "BULUNAMADI"
    SONRADAN_BULUNDU = "SONRADAN_BULUNDU"
    TEKRAR_BULUNDU = "TEKRAR_BULUNDU"
    YANLIS_LOKASYONDA = "YANLIS_LOKASYONDA"


@dataclass
class StockRow:
    etiket: str
    shelf: str
    quantity: float
    row_index: int = 0
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ShelfItem:
    line_id: str
    etiket: str
    expected: float
    scanned: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)
    tracking_status: Optional[str] = None

    @property
    def status(self) -> ItemStatus:
        eps = 1e-6
        if self.scanned <= 0:
            return ItemStatus.PENDING
        if abs(self.scanned - self.expected) <= eps:
            return ItemStatus.COMPLETE
        if self.scanned < self.expected - eps:
            return ItemStatus.SHORT
        return ItemStatus.OVER


@dataclass
class EtiketInfo:
    etiket: str
    shelves: dict[str, float]
    total_expected: float
    is_unassigned: bool
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ShelfStats:
    shelf: str
    total_etikets: int
    completed_etikets: int
    short_etikets: int
    over_etikets: int
    pending_etikets: int
    not_found_etikets: int = 0
    total_expected: float = 0.0
    total_scanned: float = 0.0

    @property
    def completion_pct(self) -> float:
        if self.total_expected == 0:
            return 100.0 if self.total_etikets == 0 else 0.0
        return round((self.total_scanned / self.total_expected) * 100, 1)


@dataclass
class ScanResult:
    etiket: str
    shelf: str
    scan_type: ScanType
    expected: float
    scanned: float
    status: ItemStatus
    message: str
    auto_switched_shelf: bool = False
    line_id: Optional[str] = None
    correct_shelf: Optional[str] = None
    scanned_shelf: Optional[str] = None
    found_missing: bool = False
