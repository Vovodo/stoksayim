import json
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from app.api.deps import count_service, get_current_user, require_role, report_service, session_repo, stock_repo, ws_connections
from app.config import settings
from app.models.domain import ScanType, UserRole
from app.api.reports import summary_to_report
from app.models.schemas import (
    EndSessionResponse,
    ExcelUploadResponse,
    FoundMissingRecoveryResponse,
    MisplacementResponse,
    NotFoundMarkRequest,
    NotFoundMarkResponse,
    NotFoundUnmarkRequest,
    NotFoundUnmarkResponse,
    ScanRequest,
    ScanResultResponse,
    SessionCreateRequest,
    SessionResponse,
    ShelfDetailResponse,
    ShelfItemResponse,
    ShelfListItem,
    UnassignedFoundResponse,
    UnknownItemResponse,
)

router = APIRouter(tags=["count"])


async def _broadcast(event: str, data: dict) -> None:
    message = json.dumps({"event": event, "data": data}, default=str)
    dead = []
    for ws in ws_connections:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


@router.post("/excel/upload", response_model=ExcelUploadResponse)
async def upload_excel(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    if not file.filename or not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Yalnızca .xlsx veya .xls dosyaları kabul edilir.")

    stock_repo.clear()

    dest = settings.upload_dir / file.filename
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        meta = stock_repo.load_from_excel(str(dest))
    except Exception as exc:
        stock_repo.clear()
        raise HTTPException(400, str(exc)) from exc

    await count_service.reload_session_state()
    await session_repo.add_audit_log(
        user["id"], "excel_upload", f"Dosya yüklendi: {file.filename}"
    )
    await session_repo.add_system_event(
        user["id"],
        "excel_upload",
        f"{user['username']} Excel yükledi: {meta['filename']}",
        filename=meta["filename"],
    )

    return ExcelUploadResponse(
        filename=meta["filename"],
        row_count=meta["row_count"],
        etiket_count=meta["etiket_count"],
        shelf_count=meta["shelf_count"],
        unassigned_count=meta["unassigned_count"],
        columns=meta["columns"],
        message="Excel başarıyla yüklendi ve indekslendi.",
    )


@router.get("/excel/info")
async def excel_info(user: dict = Depends(get_current_user)):
    if not stock_repo.is_loaded():
        return {"loaded": False}
    meta = stock_repo.get_metadata()
    return {"loaded": True, **meta, "etiket_count": meta.get("etiket_count", 0)}


@router.post("/admin/reset")
async def reset_system(user: dict = Depends(get_current_user)):
    """Bellek, sayım veritabanı ve yüklenen Excel dosyalarını sıfırla."""
    await count_service.reset_system(user["id"])

    upload_dir = Path(settings.upload_dir)
    removed = 0
    for f in upload_dir.glob("*.xlsx"):
        f.unlink(missing_ok=True)
        removed += 1
    for f in upload_dir.glob("*.xls"):
        f.unlink(missing_ok=True)
        removed += 1

    await _broadcast("session_ended", {})
    await _broadcast("system_reset", {})

    return {
        "message": "Sistem sıfırlandı. Yeni Excel yükleyip sayım başlatabilirsiniz.",
        "files_removed": removed,
    }


@router.post("/sessions/start", response_model=SessionResponse)
async def start_session(
    body: SessionCreateRequest,
    user: dict = Depends(get_current_user),
):
    name = body.name or f"Sayım {datetime.now().strftime('%d.%m.%Y %H:%M')}"
    try:
        session = await count_service.start_session(name, user["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    await _broadcast("session_started", session)
    return _session_response(session)


@router.post("/sessions/end", response_model=EndSessionResponse)
async def end_session(user: dict = Depends(get_current_user)):
    try:
        session_id = await count_service.end_session(user["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    completed = await session_repo.get_session(session_id)
    if not completed:
        raise HTTPException(500, "Tamamlanan oturum bulunamadı.")

    summary = await report_service.build_summary(completed)
    fname = f"sayim_raporu_{session_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    report_service.export_excel(summary, fname)
    report = summary_to_report(summary, report_filename=fname)

    await _broadcast("session_ended", {})
    return EndSessionResponse(
        message="Sayım tamamlandı. Rapor hazırlandı.",
        report=report,
        report_filename=fname,
    )


@router.get("/sessions/active", response_model=SessionResponse | None)
async def active_session(user: dict = Depends(get_current_user)):
    session = await session_repo.get_active_session()
    if not session:
        return None
    return _session_response(session)


def _item_response(item) -> ShelfItemResponse:
    return ShelfItemResponse(
        line_id=item.line_id,
        etiket=item.etiket,
        expected=item.expected,
        scanned=item.scanned,
        status=item.status,
        extra=item.extra,
        tracking_status=item.tracking_status,
    )


@router.get("/corrections", response_model=list[MisplacementResponse])
async def list_corrections(user: dict = Depends(get_current_user)):
    items = await count_service.get_corrections()
    return [MisplacementResponse(**i) for i in items]


@router.get("/not-found/recoveries", response_model=list[FoundMissingRecoveryResponse])
async def list_not_found_recoveries(user: dict = Depends(get_current_user)):
    items = await count_service.get_not_found_recoveries()
    return [FoundMissingRecoveryResponse(**i) for i in items]


@router.post("/not-found/mark", response_model=NotFoundMarkResponse)
async def mark_not_found(
    body: NotFoundMarkRequest,
    user: dict = Depends(get_current_user),
):
    try:
        result = await count_service.mark_not_found(body.shelf, body.line_ids, user["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    detail = count_service.get_shelf_detail(body.shelf)
    stats = detail["stats"]
    summaries = count_service.get_all_shelf_summaries()
    await _broadcast(
        "not_found_marked",
        {
            "shelf": body.shelf,
            "line_ids": result["line_ids"],
            "items": [_item_response(i).model_dump() for i in detail["items"]],
            "stats": {
                "total_etikets": stats.total_etikets,
                "completed_etikets": stats.completed_etikets,
                "short_etikets": stats.short_etikets,
                "over_etikets": stats.over_etikets,
                "pending_etikets": stats.pending_etikets,
                "not_found_etikets": stats.not_found_etikets,
                "total_expected": stats.total_expected,
                "total_scanned": stats.total_scanned,
                "completion_pct": stats.completion_pct,
            },
            "shelves": summaries,
        },
    )
    return NotFoundMarkResponse(**result)


@router.post("/not-found/unmark", response_model=NotFoundUnmarkResponse)
async def unmark_not_found(
    body: NotFoundUnmarkRequest,
    user: dict = Depends(get_current_user),
):
    try:
        result = await count_service.unmark_not_found(body.line_id, user["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    shelf = result["shelf"]
    detail = count_service.get_shelf_detail(shelf)
    stats = detail["stats"]
    summaries = count_service.get_all_shelf_summaries()
    await _broadcast(
        "not_found_unmarked",
        {
            "shelf": shelf,
            "line_id": result["line_id"],
            "items": [_item_response(i).model_dump() for i in detail["items"]],
            "stats": {
                "total_etikets": stats.total_etikets,
                "completed_etikets": stats.completed_etikets,
                "short_etikets": stats.short_etikets,
                "over_etikets": stats.over_etikets,
                "pending_etikets": stats.pending_etikets,
                "not_found_etikets": stats.not_found_etikets,
                "total_expected": stats.total_expected,
                "total_scanned": stats.total_scanned,
                "completion_pct": stats.completion_pct,
            },
            "shelves": summaries,
        },
    )
    return NotFoundUnmarkResponse(**result)


@router.delete("/corrections/{correction_id}", status_code=204)
async def revert_correction(
    correction_id: int,
    user: dict = Depends(get_current_user),
):
    try:
        await count_service.revert_correction(correction_id, user["id"])
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    corrections = await count_service.get_corrections()
    summaries = count_service.get_all_shelf_summaries()
    await _broadcast("correction", {"corrections": corrections})
    await _broadcast("misplacement", {"corrections": corrections})
    await _broadcast(
        "shelves_updated",
        {"shelves": summaries, "active_shelf": count_service.active_shelf},
    )


@router.post("/scan", response_model=ScanResultResponse)
async def scan_barcode(
    body: ScanRequest,
    user: dict = Depends(get_current_user),
):
    try:
        result = await count_service.process_scan(
            body.etiket, user["id"], body.shelf_override
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    active = count_service.active_shelf or result.shelf or ""
    summaries = count_service.get_all_shelf_summaries()

    if result.scan_type == ScanType.IGNORED:
        return ScanResultResponse(
            etiket=result.etiket,
            shelf=active,
            scan_type=result.scan_type,
            expected=0.0,
            scanned=0.0,
            status=result.status,
            message="",
            auto_switched_shelf=False,
            active_shelf=active,
            shelves_summary=summaries,
        )

    shelf_detail = count_service.get_shelf_detail(result.shelf)
    stats = shelf_detail["stats"]
    updated_item = None
    if result.scan_type != ScanType.MISPLACED:
        for i in shelf_detail["items"]:
            if result.line_id and i.line_id == result.line_id:
                updated_item = _item_response(i)
                break
        if updated_item is None:
            for i in shelf_detail["items"]:
                if i.etiket == result.etiket:
                    updated_item = _item_response(i)
                    break

    response = ScanResultResponse(
        etiket=result.etiket,
        shelf=result.shelf,
        scan_type=result.scan_type,
        expected=result.expected,
        scanned=result.scanned,
        status=result.status,
        message=result.message,
        auto_switched_shelf=result.auto_switched_shelf,
        active_shelf=active,
        updated_item=updated_item,
        correct_shelf=result.correct_shelf,
        scanned_shelf=result.scanned_shelf,
        found_missing=result.found_missing,
        shelf_stats={
            "total_etikets": stats.total_etikets,
            "completed_etikets": stats.completed_etikets,
            "short_etikets": stats.short_etikets,
            "over_etikets": stats.over_etikets,
            "pending_etikets": stats.pending_etikets,
            "not_found_etikets": stats.not_found_etikets,
            "total_expected": stats.total_expected,
            "total_scanned": stats.total_scanned,
            "completion_pct": stats.completion_pct,
        },
        shelves_summary=summaries,
    )

    await _broadcast("scan", {
        "result": response.model_dump(),
        "active_shelf": active,
        "shelf_changed": result.auto_switched_shelf,
    })
    if result.scan_type in (ScanType.MISPLACED, ScanType.UNASSIGNED, ScanType.UNKNOWN):
        corrections = await count_service.get_corrections()
        await _broadcast("correction", {"corrections": corrections})
        await _broadcast("misplacement", {"corrections": corrections})
    if result.scan_type == ScanType.FOUND_MISSING:
        recoveries = await count_service.get_not_found_recoveries()
        await _broadcast("found_missing", {"recoveries": recoveries})
    return response


@router.get("/shelves", response_model=list[ShelfListItem])
async def list_shelves(user: dict = Depends(get_current_user)):
    if not stock_repo.is_loaded():
        return []
    return [ShelfListItem(**s) for s in count_service.get_all_shelf_summaries()]


@router.get("/shelves/{shelf}", response_model=ShelfDetailResponse)
async def get_shelf(shelf: str, user: dict = Depends(get_current_user)):
    if not stock_repo.is_loaded():
        raise HTTPException(404, "Excel yüklenmemiş. Yönetim'den Excel yükleyin.")
    detail = count_service.get_shelf_detail(shelf)
    stats = detail["stats"]
    return ShelfDetailResponse(
        shelf=shelf,
        items=[_item_response(i) for i in detail["items"]],
        stats={
            "total_etikets": stats.total_etikets,
            "completed_etikets": stats.completed_etikets,
            "short_etikets": stats.short_etikets,
            "over_etikets": stats.over_etikets,
            "pending_etikets": stats.pending_etikets,
            "not_found_etikets": stats.not_found_etikets,
            "total_expected": stats.total_expected,
            "total_scanned": stats.total_scanned,
            "completion_pct": stats.completion_pct,
        },
    )


@router.post("/shelves/{shelf}/activate")
async def activate_shelf(shelf: str, user: dict = Depends(get_current_user)):
    try:
        await count_service.set_active_shelf(shelf, user["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    detail = count_service.get_shelf_detail(shelf)
    await _broadcast("shelf_activated", {
        "shelf": shelf,
        "detail": _format_shelf(detail),
    })
    return {"active_shelf": shelf}


@router.get("/unknown", response_model=list[UnknownItemResponse])
async def unknown_items(user: dict = Depends(get_current_user)):
    session = await session_repo.get_active_session()
    if not session:
        return []
    items = await session_repo.get_unknown_items(session["id"])
    return [
        UnknownItemResponse(
            etiket=i["reference"],
            scanned_qty=i["scanned_qty"],
            shelf=i["shelf"],
            last_scan_at=i["last_scan_at"],
            username=i["username"],
        )
        for i in items
    ]


@router.get("/unassigned-found", response_model=list[UnassignedFoundResponse])
async def unassigned_found(user: dict = Depends(get_current_user)):
    session = await session_repo.get_active_session()
    if not session:
        return []
    items = await session_repo.get_unassigned_found(session["id"])
    return [
        UnassignedFoundResponse(
            etiket=i["reference"],
            found_shelf=i["found_shelf"],
            scanned_qty=i["scanned_qty"],
            status=i["status"],
            counted_at=i["counted_at"],
            username=i["username"],
        )
        for i in items
    ]


def _session_response(session: dict) -> SessionResponse:
    return SessionResponse(
        id=session["id"],
        name=session["name"],
        status=session["status"],
        started_at=session.get("started_at"),
        ended_at=session.get("ended_at"),
        started_by=session.get("started_by_name") or str(session.get("started_by", "")),
        active_shelf=session.get("active_shelf") or count_service.active_shelf,
        excel_filename=session.get("excel_filename"),
    )


def _format_shelf(detail: dict) -> dict:
    stats = detail["stats"]
    return {
        "shelf": detail["shelf"],
        "items": [
            {
                "line_id": i.line_id,
                "etiket": i.etiket,
                "expected": i.expected,
                "scanned": i.scanned,
                "status": i.status.value,
                "extra": i.extra,
                "tracking_status": i.tracking_status,
            }
            for i in detail["items"]
        ],
        "stats": {
            "total_etikets": stats.total_etikets,
            "completed_etikets": stats.completed_etikets,
            "short_etikets": stats.short_etikets,
            "over_etikets": stats.over_etikets,
            "pending_etikets": stats.pending_etikets,
            "not_found_etikets": stats.not_found_etikets,
            "total_expected": stats.total_expected,
            "total_scanned": stats.total_scanned,
            "completion_pct": stats.completion_pct,
        },
    }
