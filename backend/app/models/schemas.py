from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator

from app.models.domain import ItemStatus, ScanType, SessionStatus, UserRole
from app.utils.etiket import normalize_scanned_code


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=4)


class UserResponse(BaseModel):
    id: int
    username: str
    role: UserRole


class UserListItem(BaseModel):
    id: int
    username: str
    role: UserRole
    created_at: datetime


class AdminResetPasswordRequest(BaseModel):
    password: str = Field(min_length=4)


class AdminResetPasswordResponse(BaseModel):
    username: str
    password: str
    message: str


class SystemEventResponse(BaseModel):
    id: int
    username: str
    action: str
    filename: Optional[str] = None
    details: str
    created_at: datetime


class ExcelUploadResponse(BaseModel):
    filename: str
    row_count: int
    etiket_count: int
    shelf_count: int
    unassigned_count: int
    columns: list[str]
    message: str


class SessionCreateRequest(BaseModel):
    name: Optional[str] = None


class SessionResponse(BaseModel):
    id: int
    name: str
    status: SessionStatus
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    started_by: Optional[str] = None
    active_shelf: Optional[str] = None
    excel_filename: Optional[str] = None


class ScanRequest(BaseModel):
    etiket: Optional[str] = None
    reference: Optional[str] = None
    shelf_override: Optional[str] = None

    @model_validator(mode="after")
    def resolve_etiket(self) -> "ScanRequest":
        raw = (self.etiket or self.reference or "").strip()
        code = normalize_scanned_code(raw)
        if not code:
            raise ValueError("Etiket kodu gerekli")
        self.etiket = code
        return self


class ShelfItemResponse(BaseModel):
    line_id: str
    etiket: str
    expected: float
    scanned: float
    status: ItemStatus
    extra: dict[str, Any] = {}
    tracking_status: Optional[str] = None


class ShelfDetailResponse(BaseModel):
    shelf: str
    items: list[ShelfItemResponse]
    stats: dict[str, Any]


class ScanResultResponse(BaseModel):
    etiket: str
    shelf: str
    scan_type: ScanType
    expected: float
    scanned: float
    status: ItemStatus
    message: str
    auto_switched_shelf: bool
    active_shelf: str
    updated_item: Optional[ShelfItemResponse] = None
    shelf_stats: dict[str, Any] = {}
    shelves_summary: list[dict[str, Any]] = []
    correct_shelf: Optional[str] = None
    scanned_shelf: Optional[str] = None
    found_missing: bool = False


class NotFoundMarkRequest(BaseModel):
    shelf: str
    line_ids: list[str] = Field(min_length=1)


class NotFoundMarkResponse(BaseModel):
    marked_count: int
    line_ids: list[str]


class NotFoundUnmarkRequest(BaseModel):
    line_id: str = Field(min_length=1)


class NotFoundUnmarkResponse(BaseModel):
    line_id: str
    etiket: str
    shelf: str


class FoundMissingRecoveryResponse(BaseModel):
    id: int
    etiket: str
    stok_no: str = ""
    product_name: str = ""
    expected_shelf: str
    found_shelf: str = ""
    initial_status: str
    final_status: str
    marked_at: datetime
    resolved_at: Optional[datetime] = None
    marked_by: str = ""
    resolved_by: str = ""


class MisplacementResponse(BaseModel):
    id: int
    etiket: str
    correct_shelf: Optional[str] = None
    scanned_shelf: str
    status: str
    created_at: datetime
    username: str


class UnknownItemResponse(BaseModel):
    etiket: str
    scanned_qty: float
    shelf: str
    last_scan_at: datetime
    username: str


class UnassignedFoundResponse(BaseModel):
    etiket: str
    found_shelf: str
    scanned_qty: float
    status: str
    counted_at: datetime
    username: str


class ShelfListItem(BaseModel):
    shelf: str
    total_etikets: int
    completed_etikets: int
    short_etikets: int = 0
    over_etikets: int = 0
    pending_etikets: int = 0
    total_expected: float = 0
    total_scanned: float = 0
    completion_pct: float


class ReportCorrectionEntry(BaseModel):
    """Rapor düzeltmeler bölümünde kalem kalem listelenen kayıt."""
    etiket: str
    category: str
    message: str
    expected_shelf: str = ""
    found_shelf: str = ""
    stok_no: str = ""
    product_name: str = ""
    username: str = ""
    created_at: datetime


class ReportSummary(BaseModel):
    session_id: int
    session_name: str
    duration_minutes: float
    total_etikets: int
    complete_count: int
    short_count: int
    over_count: int
    unknown_count: int
    unassigned_found_count: int
    total_scanned: float
    total_expected: float
    performance_pct: float
    corrections_count: int = 0
    pending_count: int = 0
    not_found_count: int = 0
    found_after_missing_count: int = 0
    wrong_location_found_count: int = 0
    real_missing_count: int = 0
    location_error_count: int = 0
    correction_entries: list[ReportCorrectionEntry] = []
    report_filename: Optional[str] = None


class ReportFileInfo(BaseModel):
    filename: str
    size_bytes: int
    created_at: datetime


class EndSessionResponse(BaseModel):
    message: str
    report: ReportSummary
    report_filename: Optional[str] = None


class AuditLogEntry(BaseModel):
    id: int
    username: str
    action: str
    details: str
    created_at: datetime
