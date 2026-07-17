from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.api.deps import count_service, get_current_user, report_service, require_role, session_repo
from app.config import settings
from app.models.domain import UserRole
from app.models.schemas import AuditLogEntry, ReportCorrectionEntry, ReportFileInfo, ReportSummary

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    text = str(value or "").strip()
    if not text:
        return datetime.utcnow()
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return datetime.utcnow()


def summary_to_report(
    summary: dict[str, Any],
    report_filename: str | None = None,
) -> ReportSummary:
    s = summary["session"]
    all_count = (
        len(summary["complete"]) + len(summary["short"])
        + len(summary["over"]) + len(summary["pending"])
    )
    correction_entries = [
        ReportCorrectionEntry(
            etiket=e["etiket"],
            category=e["category"],
            message=e["message"],
            expected_shelf=e.get("expected_shelf") or "",
            found_shelf=e.get("found_shelf") or "",
            stok_no=e.get("stok_no") or "",
            product_name=e.get("product_name") or "",
            username=e.get("username") or "",
            created_at=_parse_dt(e.get("created_at")),
        )
        for e in summary.get("correction_log", [])
    ]
    return ReportSummary(
        session_id=s["id"],
        session_name=s["name"],
        duration_minutes=summary["duration_minutes"],
        total_etikets=all_count,
        complete_count=len(summary["complete"]),
        short_count=len(summary["short"]),
        over_count=len(summary["over"]),
        unknown_count=len(summary["unknown"]),
        unassigned_found_count=len(summary["unassigned_found"]),
        total_scanned=summary["total_scanned"],
        total_expected=summary["total_expected"],
        performance_pct=summary["performance_pct"],
        corrections_count=len(correction_entries),
        pending_count=len(summary["pending"]),
        not_found_count=len(summary.get("not_found_markings", [])),
        found_after_missing_count=len(summary.get("found_after_missing", []))
        + len(summary.get("found_on_correct_shelf", [])),
        wrong_location_found_count=len(summary.get("found_after_missing", [])),
        real_missing_count=len(summary.get("not_found_still_missing", [])),
        location_error_count=len(summary.get("found_after_missing", [])),
        correction_entries=correction_entries,
        report_filename=report_filename,
    )


@router.get("/summary", response_model=ReportSummary)
async def report_summary(user: dict = Depends(get_current_user)):
    session = await session_repo.get_count_session()
    if not session:
        raise HTTPException(404, "Rapor için oturum bulunamadı.")

    summary = await report_service.build_summary(session)
    latest = _latest_report_for_session(session["id"])
    return summary_to_report(summary, report_filename=latest)


@router.get("/files", response_model=list[ReportFileInfo])
async def list_report_files(user: dict = Depends(get_current_user)):
    files = report_service.list_report_files()
    return [
        ReportFileInfo(
            filename=f["filename"],
            size_bytes=f["size_bytes"],
            created_at=_parse_dt(f["created_at"]),
        )
        for f in files
    ]


@router.get("/download/{filename}")
async def download_report_file(
    filename: str,
    user: dict = Depends(get_current_user),
):
    safe_name = Path(filename).name
    if not safe_name.startswith("sayim_raporu_") or not safe_name.endswith(".xlsx"):
        raise HTTPException(400, "Geçersiz rapor dosyası.")
    path = settings.report_dir / safe_name
    if not path.is_file():
        raise HTTPException(404, "Rapor dosyası bulunamadı.")
    return FileResponse(
        path,
        filename=safe_name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@router.get("/export/excel")
async def export_excel(user: dict = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))):
    session = await _get_report_session()
    summary = await report_service.build_summary(session)
    fname = f"sayim_raporu_{session['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    path = report_service.export_excel(summary, fname)
    return FileResponse(path, filename=fname, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


@router.get("/export/pdf")
async def export_pdf(user: dict = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))):
    session = await _get_report_session()
    summary = await report_service.build_summary(session)
    fname = f"sayim_raporu_{session['id']}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
    path = report_service.export_pdf(summary, fname)
    return FileResponse(path, filename=fname, media_type="application/pdf")


@router.get("/audit", response_model=list[AuditLogEntry])
async def audit_logs(user: dict = Depends(require_role(UserRole.ADMIN))):
    session = await session_repo.get_active_session()
    sid = session["id"] if session else None
    logs = await session_repo.get_audit_logs(sid)
    return [
        AuditLogEntry(
            id=l["id"],
            username=l.get("username", ""),
            action=l["action"],
            details=l.get("details", ""),
            created_at=l["created_at"],
        )
        for l in logs
    ]


async def _get_report_session() -> dict:
    session = await session_repo.get_count_session()
    if not session:
        raise HTTPException(404, "Rapor için oturum bulunamadı.")
    return session


def _latest_report_for_session(session_id: int) -> str | None:
    prefix = f"sayim_raporu_{session_id}_"
    matches = sorted(
        settings.report_dir.glob(f"{prefix}*.xlsx"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return matches[0].name if matches else None
