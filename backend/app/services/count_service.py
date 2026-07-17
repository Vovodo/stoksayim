from typing import Any, Optional
import asyncio

from app.core.logging import logger
from app.models.domain import (
    CountTrackingStatus,
    ItemStatus,
    ScanResult,
    ScanType,
    ShelfItem,
    ShelfStats,
)
from app.repositories.excel_repository import ExcelStockRepository
from app.repositories.sqlite_repository import SQLiteSessionRepository
from app.utils.depo import normalize_depo
from app.utils.etiket import normalize_scanned_code


class CountService:
    """Sayım iş mantığı — bellekte hızlı erişim + SQLite kalıcılık."""

    def __init__(
        self,
        stock_repo: ExcelStockRepository,
        session_repo: SQLiteSessionRepository,
    ) -> None:
        self.stock = stock_repo
        self.sessions = session_repo
        self._scan_cache: dict[str, float] = {}  # line_id -> okutulan metraj
        self._unknown_cache: dict[tuple[str, str], float] = {}
        self._unassigned_cache: dict[tuple[str, str], float] = {}
        self._active_session_id: Optional[int] = None
        self._active_shelf: Optional[str] = None
        self._scan_lock = asyncio.Lock()
        self._not_found_by_line: dict[str, dict[str, Any]] = {}
        self._not_found_active_by_etiket: dict[str, dict[str, Any]] = {}

    async def _reload_not_found_cache(self, session_id: int) -> None:
        rows = await self.sessions.get_not_found_markings(session_id)
        self._not_found_by_line.clear()
        self._not_found_active_by_etiket.clear()
        for row in rows:
            self._not_found_by_line[row["line_id"]] = row
            if row["tracking_status"] == CountTrackingStatus.BULUNAMADI.value:
                self._not_found_active_by_etiket[row["etiket"]] = row

    @staticmethod
    def _extra_field(extra: dict[str, Any], *keys: str) -> str:
        for key in keys:
            val = extra.get(key)
            if val is not None and str(val).strip():
                return str(val).strip()
        return ""

    async def reload_session_state(self) -> None:
        session = await self.sessions.get_active_session()
        if not session:
            self._active_session_id = None
            self._active_shelf = None
            self._scan_cache.clear()
            self._unknown_cache.clear()
            self._unassigned_cache.clear()
            self._not_found_by_line.clear()
            self._not_found_active_by_etiket.clear()
            return

        self._active_session_id = session["id"]
        self._active_shelf = session.get("active_shelf")

        counts = await self.sessions.get_all_scan_counts_by_type(session["id"])
        self._scan_cache = counts.get("normal", {})
        self._unassigned_cache = counts.get("unassigned", {})
        self._unknown_cache = counts.get("unknown", {})

        if self.stock.is_loaded():
            for shelf in self.stock.get_shelves():
                for item in self.stock.get_shelf_items(shelf):
                    line_id = item["line_id"]
                    if line_id in self._scan_cache:
                        self._scan_cache[line_id] = self._heal_inflated_scan(
                            line_id,
                            item["expected"],
                            self._scan_cache[line_id],
                        )
        await self._reload_not_found_cache(session["id"])

    async def start_session(self, name: str, user_id: int) -> dict:
        if not self.stock.is_loaded():
            raise ValueError("Önce Excel dosyası yüklenmelidir.")

        meta = self.stock.get_metadata()
        session_id = await self.sessions.create_session(
            name, user_id, meta.get("filename", "")
        )
        shelves = self.stock.get_shelves()
        initial_shelf = shelves[0] if shelves else None
        if initial_shelf:
            await self.sessions.set_active_shelf(session_id, initial_shelf)

        self._active_session_id = session_id
        self._active_shelf = initial_shelf
        self._scan_cache.clear()
        self._unknown_cache.clear()
        self._unassigned_cache.clear()
        self._not_found_by_line.clear()
        self._not_found_active_by_etiket.clear()

        await self.sessions.add_audit_log(
            user_id, "session_start", f"Sayım başlatıldı: {name}", session_id
        )
        await self.sessions.add_system_event(
            user_id,
            "session_start",
            f"Sayım başlatıldı: {name}",
        )
        logger.info("Sayım oturumu başlatıldı: %s (id=%d)", name, session_id)
        return await self.sessions.get_session(session_id)

    async def end_session(self, user_id: int) -> int:
        if not self._active_session_id:
            raise ValueError("Aktif sayım oturumu yok.")
        session_id = self._active_session_id
        await self.sessions.end_session(session_id)
        await self.sessions.add_audit_log(
            user_id, "session_end", "Sayım tamamlandı", session_id
        )
        await self.sessions.add_system_event(
            user_id,
            "session_end",
            "Sayım tamamlandı",
        )
        self._active_session_id = None
        self._active_shelf = None
        return session_id

    async def reset_system(self, user_id: int) -> None:
        """Tüm sayım belleğini ve veritabanı kayıtlarını sıfırla."""
        self.stock.clear()
        self._scan_cache.clear()
        self._unknown_cache.clear()
        self._unassigned_cache.clear()
        self._not_found_by_line.clear()
        self._not_found_active_by_etiket.clear()
        self._active_session_id = None
        self._active_shelf = None
        await self.sessions.reset_all_count_data()
        await self.sessions.add_audit_log(user_id, "system_reset", "Sistem tamamen sıfırlandı")
        await self.sessions.add_system_event(
            user_id,
            "system_reset",
            "Sistem tamamen sıfırlandı",
        )
        logger.info("CountService sistem sıfırlaması tamamlandı.")

    async def set_active_shelf(self, shelf: str, user_id: int) -> None:
        if not self._active_session_id:
            raise ValueError("Aktif sayım oturumu yok.")
        shelf = normalize_depo(shelf)
        self._active_shelf = shelf
        await self.sessions.set_active_shelf(self._active_session_id, shelf)
        await self.sessions.add_audit_log(
            user_id, "shelf_switch", f"Raf değiştirildi: {shelf}", self._active_session_id
        )

    _QTY_EPS = 1e-6

    def _item_status(self, expected: float, scanned: float) -> ItemStatus:
        if scanned <= 0:
            return ItemStatus.PENDING
        if abs(scanned - expected) <= self._QTY_EPS:
            return ItemStatus.COMPLETE
        if scanned < expected - self._QTY_EPS:
            return ItemStatus.SHORT
        return ItemStatus.OVER

    @staticmethod
    def _apply_metraj_scan(prev: float, line_expected: float) -> float:
        """İlk okutma = satırın beklenen miktarı. Aynı satır tekrar okutulursa miktar artmaz."""
        if prev <= 0:
            return line_expected
        return prev

    def _heal_inflated_scan(self, line_id: str, expected: float, scanned: float) -> float:
        """Eski hatadan kalan katlanmış okutma değerlerini (örn. 5×52,5) düzelt."""
        if expected <= 0 or scanned <= expected + self._QTY_EPS:
            return scanned
        ratio = scanned / expected
        n = round(ratio)
        if n >= 2 and abs(ratio - n) <= 0.02:
            self._scan_cache[line_id] = expected
            return expected
        return scanned

    def _resolve_scan_line(self, code: str, target_shelf: str) -> dict[str, Any]:
        """Etiket için hedef raftaki sayılacak Excel satırını seç (line_id)."""
        lines = [
            ln
            for ln in self.stock.get_shelf_items(target_shelf)
            if ln["etiket"] == code
        ]
        if not lines:
            raise ValueError(f"Etiket {code} raf {target_shelf} listesinde bulunamadı.")

        for ln in lines:
            prev = self._scan_cache.get(ln["line_id"], 0.0)
            if self._item_status(ln["expected"], prev) != ItemStatus.COMPLETE:
                return ln

        return lines[0]

    @staticmethod
    def _format_correct_shelves(shelves: dict[str, float]) -> str:
        normalized = {normalize_depo(k): v for k, v in shelves.items() if normalize_depo(k)}
        if not normalized:
            return "—"
        if len(normalized) == 1:
            return next(iter(normalized))
        primary = max(normalized, key=normalized.get)
        others = [s for s in sorted(normalized) if s != primary]
        return f"{primary} ({', '.join(others)})"

    async def get_corrections(self, session_id: Optional[int] = None) -> list[dict[str, Any]]:
        if session_id is not None:
            rows = await self.sessions.get_misplacements(session_id)
        else:
            rows = await self.sessions.get_all_misplacements()
        return [
            {
                "id": r["id"],
                "etiket": r["etiket"],
                "correct_shelf": r["correct_shelf"] or None,
                "scanned_shelf": r["scanned_shelf"],
                "status": r["status"],
                "created_at": r["created_at"],
                "username": r.get("username", ""),
            }
            for r in rows
        ]

    async def get_misplacements(self) -> list[dict[str, Any]]:
        return await self.get_corrections()

    async def revert_correction(self, correction_id: int, user_id: int) -> dict[str, Any]:
        row = await self.sessions.get_correction_by_id(correction_id)
        if not row:
            raise ValueError("Anomali kaydı bulunamadı")

        session_id = row["session_id"]
        etiket = row["etiket"]
        scanned_shelf = row["scanned_shelf"]
        status = row["status"]

        scan_type = "misplaced"
        if status == "Boş raf bilgisi":
            scan_type = "unassigned"
        elif status == "Raf bulunamadı":
            scan_type = "unknown"

        await self.sessions.delete_correction_by_id(correction_id)
        await self.sessions.delete_latest_scan_event(
            session_id, etiket, scanned_shelf, scan_type
        )

        if scan_type == "unknown":
            await self.sessions.sync_unknown_item_qty(session_id, etiket, scanned_shelf)
        elif scan_type == "unassigned":
            await self.sessions.sync_unassigned_found_qty(
                session_id, etiket, scanned_shelf
            )

        if self._active_session_id == session_id:
            counts = await self.sessions.get_all_scan_counts_by_type(session_id)
            self._unassigned_cache = counts.get("unassigned", {})
            self._unknown_cache = counts.get("unknown", {})

        await self.sessions.add_audit_log(
            user_id,
            "correction_revert",
            f"Anomali geri alındı: {etiket} ({status}) @ {scanned_shelf}",
            session_id,
        )
        logger.info(
            "CORRECTION_REVERT id=%s etiket=%r status=%r shelf=%r",
            correction_id,
            etiket,
            status,
            scanned_shelf,
        )
        return row

    async def mark_not_found(
        self, shelf: str, line_ids: list[str], user_id: int
    ) -> dict[str, Any]:
        if not self._active_session_id:
            raise ValueError("Aktif sayım oturumu yok.")
        shelf = normalize_depo(shelf)
        marked: list[dict[str, Any]] = []

        shelf_items = {ln["line_id"]: ln for ln in self.stock.get_shelf_items(shelf)}
        for line_id in line_ids:
            if line_id in self._not_found_by_line:
                continue
            item = shelf_items.get(line_id)
            if not item:
                continue
            if self._scan_cache.get(line_id, 0.0) > self._QTY_EPS:
                continue

            extra = item.get("extra", {})
            stok = self._extra_field(extra, "Stok No", "Stok No.", "Stok Kodu", "Stok Kod")
            pname = self._extra_field(extra, "Tanım", "Tanim", "Ürün Adı", "Urun Adi", "Açıklama")
            row = await self.sessions.insert_not_found_marking(
                self._active_session_id,
                line_id,
                item["etiket"],
                shelf,
                item["expected"],
                stok,
                pname,
                user_id,
            )
            self._not_found_by_line[line_id] = row
            self._not_found_active_by_etiket[item["etiket"]] = row
            marked.append(row)

            await self.sessions.add_audit_log(
                user_id,
                "not_found_mark",
                f"{item['etiket']} bulunamadı işaretlendi @ {shelf}",
                self._active_session_id,
            )
            await self.sessions.add_system_event(
                user_id,
                "not_found_mark",
                f"{item['etiket']} @ {shelf} bulunamadı olarak işaretlendi",
            )
            logger.info(
                "NOT_FOUND_MARK etiket=%r line_id=%r shelf=%r user=%d",
                item["etiket"],
                line_id,
                shelf,
                user_id,
            )

        return {"marked_count": len(marked), "line_ids": [m["line_id"] for m in marked]}

    async def unmark_not_found(self, line_id: str, user_id: int) -> dict[str, Any]:
        if not self._active_session_id:
            raise ValueError("Aktif sayım oturumu yok.")
        marking = self._not_found_by_line.get(line_id)
        if not marking:
            marking = await self.sessions.get_not_found_by_line(
                self._active_session_id, line_id
            )
        if not marking:
            raise ValueError("Bulunamadı işareti bulunamadı.")
        if marking["tracking_status"] != CountTrackingStatus.BULUNAMADI.value:
            raise ValueError("Yalnızca aktif bulunamadı işaretleri geri alınabilir.")

        etiket = marking["etiket"]
        shelf = marking["expected_shelf"]
        await self.sessions.delete_not_found_marking(marking["id"])
        self._not_found_by_line.pop(line_id, None)
        if self._not_found_active_by_etiket.get(etiket, {}).get("line_id") == line_id:
            self._not_found_active_by_etiket.pop(etiket, None)

        await self.sessions.add_audit_log(
            user_id,
            "not_found_unmark",
            f"{etiket} bulunamadı işareti geri alındı @ {shelf}",
            self._active_session_id,
        )
        await self.sessions.add_system_event(
            user_id,
            "not_found_unmark",
            f"{etiket} @ {shelf} bulunamadı işareti geri alındı",
        )
        logger.info(
            "NOT_FOUND_UNMARK etiket=%r line_id=%r shelf=%r user=%d",
            etiket,
            line_id,
            shelf,
            user_id,
        )
        return {"line_id": line_id, "etiket": etiket, "shelf": shelf}

    async def get_not_found_recoveries(
        self, session_id: Optional[int] = None
    ) -> list[dict[str, Any]]:
        sid = session_id if session_id is not None else self._active_session_id
        if not sid:
            return []
        rows = await self.sessions.get_not_found_recoveries(sid)
        return [
            {
                "id": r["id"],
                "etiket": r["etiket"],
                "stok_no": r.get("stok_no") or "",
                "product_name": r.get("product_name") or "",
                "expected_shelf": r["expected_shelf"],
                "found_shelf": r.get("found_shelf") or "",
                "initial_status": CountTrackingStatus.BULUNAMADI.value,
                "final_status": r["tracking_status"],
                "marked_at": r["marked_at"],
                "resolved_at": r.get("resolved_at"),
                "marked_by": r.get("marked_by_name") or "",
                "resolved_by": r.get("resolved_by_name") or "",
            }
            for r in rows
        ]

    async def _try_handle_not_found_scan(
        self, code: str, etiket_info: dict, user_id: int
    ) -> Optional[ScanResult]:
        marking = self._not_found_active_by_etiket.get(code)
        if not marking:
            return None

        active_shelf = normalize_depo(self._active_shelf or "")
        expected_shelf = normalize_depo(marking["expected_shelf"])

        if active_shelf == expected_shelf:
            await self.sessions.update_not_found_status(
                marking["id"],
                CountTrackingStatus.TEKRAR_BULUNDU.value,
                user_id,
                active_shelf,
            )
            updated = await self.sessions.get_not_found_by_line(
                self._active_session_id, marking["line_id"]
            )
            if updated:
                self._not_found_by_line[marking["line_id"]] = updated
            self._not_found_active_by_etiket.pop(code, None)

            await self.sessions.add_audit_log(
                user_id,
                "not_found_recovery",
                (
                    f"{code} beklenen rafta tekrar bulundu: {active_shelf} "
                    f"(önce bulunamadı işaretliydi)"
                ),
                self._active_session_id,
            )
            await self.sessions.add_system_event(
                user_id,
                "not_found_recovery",
                f"{code} @ {active_shelf} tekrar bulundu (bulunamadı kaydı kaldırıldı)",
            )
            logger.info(
                "NOT_FOUND_RECOVERY_SAME_SHELF etiket=%r shelf=%r",
                code,
                active_shelf,
            )
            return await self._handle_normal(code, etiket_info, user_id)

        return await self._handle_found_after_missing(
            code, marking, active_shelf, user_id
        )

    async def _handle_found_after_missing(
        self,
        code: str,
        marking: dict[str, Any],
        active_shelf: str,
        user_id: int,
    ) -> ScanResult:
        expected_shelf = marking["expected_shelf"]
        line_id = marking["line_id"]
        expected = float(marking.get("expected") or 0)

        await self.sessions.update_not_found_status(
            marking["id"],
            CountTrackingStatus.SONRADAN_BULUNDU.value,
            user_id,
            active_shelf,
        )
        updated = await self.sessions.get_not_found_by_line(
            self._active_session_id, line_id
        )
        if updated:
            self._not_found_by_line[line_id] = updated
        self._not_found_active_by_etiket.pop(code, None)

        await self.sessions.record_scan(
            self._active_session_id,
            user_id,
            code,
            active_shelf,
            ScanType.FOUND_MISSING.value,
            expected,
            0.0,
            line_id=line_id,
        )
        await self.sessions.add_audit_log(
            user_id,
            "not_found_recovery",
            (
                f"{code} yanlış rafta bulundu: beklenen={expected_shelf}, "
                f"bulunan={active_shelf}"
            ),
            self._active_session_id,
        )
        await self.sessions.add_system_event(
            user_id,
            "not_found_recovery",
            (
                f"{code} bulunamadı işaretliydi; {active_shelf} rafında bulundu "
                f"(beklenen: {expected_shelf})"
            ),
        )
        logger.info(
            "NOT_FOUND_RECOVERY_WRONG_SHELF etiket=%r expected=%r found=%r",
            code,
            expected_shelf,
            active_shelf,
        )

        msg = (
            f'Daha önce "Bulunamadı" olarak işaretlenen ürün bulundu. '
            f"Etiket: {code} · Beklenen Raf: {expected_shelf} · "
            f"Bulunduğu Raf: {active_shelf} · Bu kayıt düzeltmeler listesine eklendi."
        )
        return ScanResult(
            etiket=code,
            shelf=active_shelf,
            scan_type=ScanType.FOUND_MISSING,
            expected=expected,
            scanned=0.0,
            status=ItemStatus.PENDING,
            message=msg,
            auto_switched_shelf=False,
            line_id=line_id,
            correct_shelf=expected_shelf,
            scanned_shelf=active_shelf,
            found_missing=True,
        )

    async def process_scan(
        self,
        etiket: str,
        user_id: int,
        shelf_override: Optional[str] = None,
    ) -> ScanResult:
        if not self._active_session_id:
            raise ValueError("Aktif sayım oturumu yok. Yönetim'den sayım başlatın.")

        code = normalize_scanned_code(etiket)
        if not code:
            raise ValueError("Geçersiz etiket kodu.")

        logger.info(
            "SCAN_DEBUG raw=%r normalized=%r active_shelf=%r",
            etiket,
            code,
            self._active_shelf,
        )

        async with self._scan_lock:
            etiket_info = self.stock.get_etiket(code)
            current_shelf = shelf_override or self._active_shelf or ""

            if etiket_info is None:
                if not self.stock.matches_etiket_format(code):
                    logger.info("SCAN_DEBUG match=NONE format-mismatch -> ignored")
                    return ScanResult(
                        etiket=code,
                        shelf=current_shelf or "",
                        scan_type=ScanType.IGNORED,
                        expected=0.0,
                        scanned=0.0,
                        status=ItemStatus.PENDING,
                        message="",
                        auto_switched_shelf=False,
                    )
                logger.info("SCAN_DEBUG match=NONE -> unknown")
                return await self._handle_unknown(code, current_shelf, user_id)

            logger.info(
                "SCAN_DEBUG match etiket=%r shelves=%r aggregated_expected=%s lines_on_shelf=%d",
                etiket_info["etiket"],
                etiket_info["shelves"],
                etiket_info["total_expected"],
                len([ln for ln in self.stock.get_shelf_items(self._active_shelf or "") if ln["etiket"] == code]),
            )

            if etiket_info["is_unassigned"]:
                return await self._handle_unassigned(code, etiket_info, current_shelf, user_id)

            nf_result = await self._try_handle_not_found_scan(code, etiket_info, user_id)
            if nf_result is not None:
                return nf_result

            return await self._handle_normal(code, etiket_info, user_id)

    async def _handle_normal(
        self, code: str, etiket_info: dict, user_id: int
    ) -> ScanResult:
        shelves = etiket_info["shelves"]
        if not shelves:
            return await self._handle_unassigned(
                code, etiket_info, self._active_shelf or "", user_id
            )

        active_shelf = normalize_depo(self._active_shelf or "")
        if not active_shelf:
            raise ValueError("Aktif raf seçilmedi. Sol panelden bir raf seçin.")

        normalized_shelves = {
            normalize_depo(k): v for k, v in shelves.items() if normalize_depo(k)
        }

        if active_shelf not in normalized_shelves:
            correct_shelf = self._format_correct_shelves(shelves)
            return await self._handle_misplaced(
                code, active_shelf, correct_shelf, user_id
            )

        line = self._resolve_scan_line(code, active_shelf)
        line_id = line["line_id"]
        expected = line["expected"]
        prev_scanned = self._scan_cache.get(line_id, 0.0)

        if (
            expected > 0
            and prev_scanned >= expected - self._QTY_EPS
            and self._item_status(expected, prev_scanned) == ItemStatus.COMPLETE
        ):
            logger.info(
                "SCAN_DEBUG duplicate line_id=%r etiket=%r expected=%s scanned=%s",
                line_id,
                code,
                expected,
                prev_scanned,
            )
            status = ItemStatus.OVER
            msg = self._status_message(status, expected, prev_scanned)
            return ScanResult(
                etiket=code,
                shelf=active_shelf,
                scan_type=ScanType.NORMAL,
                expected=expected,
                scanned=prev_scanned,
                status=status,
                message=msg,
                auto_switched_shelf=False,
                line_id=line_id,
            )

        scanned = self._apply_metraj_scan(prev_scanned, expected)
        self._scan_cache[line_id] = scanned

        logger.info(
            "SCAN_DEBUG metraj line_id=%r etiket=%r expected=%s prev=%s scanned=%s active_shelf=%s",
            line_id,
            code,
            expected,
            prev_scanned,
            scanned,
            active_shelf,
        )

        await self.sessions.record_scan(
            self._active_session_id,
            user_id,
            code,
            active_shelf,
            ScanType.NORMAL.value,
            expected,
            scanned,
            line_id=line_id,
        )

        status = self._item_status(expected, scanned)
        msg = self._status_message(status, expected, scanned)

        return ScanResult(
            etiket=code,
            shelf=active_shelf,
            scan_type=ScanType.NORMAL,
            expected=expected,
            scanned=scanned,
            status=status,
            message=msg,
            auto_switched_shelf=False,
            line_id=line_id,
        )

    async def _handle_misplaced(
        self,
        code: str,
        scanned_shelf: str,
        correct_shelf: str,
        user_id: int,
    ) -> ScanResult:
        await self.sessions.record_misplacement(
            self._active_session_id,
            user_id,
            code,
            correct_shelf,
            scanned_shelf,
        )
        await self.sessions.record_scan(
            self._active_session_id,
            user_id,
            code,
            scanned_shelf,
            ScanType.MISPLACED.value,
            0.0,
            0.0,
        )
        await self.sessions.add_audit_log(
            user_id,
            "misplacement",
            f"{code}: doğru={correct_shelf}, okutulan={scanned_shelf}",
            self._active_session_id,
        )

        msg = (
            f"Bu ürün {correct_shelf} rafında kayıtlıdır. "
            f"Şu anda {scanned_shelf} rafında okutuluyor."
        )
        logger.info("MISPLACEMENT etiket=%r correct=%r scanned=%r", code, correct_shelf, scanned_shelf)

        return ScanResult(
            etiket=code,
            shelf=scanned_shelf,
            scan_type=ScanType.MISPLACED,
            expected=0.0,
            scanned=0.0,
            status=ItemStatus.PENDING,
            message=msg,
            auto_switched_shelf=False,
            correct_shelf=correct_shelf,
            scanned_shelf=scanned_shelf,
        )

    async def _handle_unassigned(
        self, code: str, etiket_info: dict, current_shelf: str, user_id: int
    ) -> ScanResult:
        if not current_shelf:
            raise ValueError(
                "Atanmamış ürün için aktif raf belirlenemedi. Raf seçin veya önce bir etiket okutun."
            )

        expected = etiket_info["total_expected"]
        key = (code, current_shelf)
        prev_scanned = self._unassigned_cache.get(key, 0.0)
        scanned = self._apply_metraj_scan(prev_scanned, expected)
        self._unassigned_cache[key] = scanned

        await self.sessions.record_scan(
            self._active_session_id,
            user_id,
            code,
            current_shelf,
            ScanType.UNASSIGNED.value,
            expected,
            scanned,
        )
        await self.sessions.upsert_unassigned_found(
            self._active_session_id, code, current_shelf, user_id, expected
        )
        await self.sessions.record_correction(
            self._active_session_id,
            user_id,
            code,
            current_shelf,
            "Boş raf bilgisi",
            "",
        )
        await self.sessions.add_audit_log(
            user_id,
            "empty_shelf",
            f"{code}: Excel depo boş, okutulan={current_shelf}",
            self._active_session_id,
        )

        status = self._item_status(expected, scanned)
        return ScanResult(
            etiket=code,
            shelf=current_shelf,
            scan_type=ScanType.UNASSIGNED,
            expected=expected,
            scanned=scanned,
            status=status,
            message=(
                f"Deposu boş bulundu — Excel'de raf yok. "
                f"Okutulan raf: {current_shelf}. Düzeltmeler'e kaydedildi."
            ),
            auto_switched_shelf=False,
            scanned_shelf=current_shelf,
        )

    async def _handle_unknown(
        self, code: str, current_shelf: str, user_id: int
    ) -> ScanResult:
        shelf = current_shelf or "BILINMEYEN"
        key = (code, shelf)
        scanned = self._unknown_cache.get(key, 0.0) + 1.0
        self._unknown_cache[key] = scanned

        await self.sessions.record_scan(
            self._active_session_id,
            user_id,
            code,
            shelf,
            ScanType.UNKNOWN.value,
            0.0,
            scanned,
        )
        await self.sessions.upsert_unknown(
            self._active_session_id, code, shelf, user_id, 1.0
        )
        await self.sessions.record_correction(
            self._active_session_id,
            user_id,
            code,
            shelf,
            "Raf bulunamadı",
            "",
        )

        return ScanResult(
            etiket=code,
            shelf=shelf,
            scan_type=ScanType.UNKNOWN,
            expected=0.0,
            scanned=scanned,
            status=ItemStatus.OVER,
            message=(
                f"Excel'de bulunmayan etiket — Raf: {shelf}. "
                f"Düzeltmeler'e kaydedildi."
            ),
            auto_switched_shelf=False,
            scanned_shelf=shelf,
        )

    @staticmethod
    def _fmt_qty(value: float) -> str:
        if abs(value - round(value)) <= CountService._QTY_EPS:
            return str(int(round(value)))
        text = f"{value:.2f}".rstrip("0").rstrip(".")
        return text

    def _status_message(
        self, status: ItemStatus, expected: float, scanned: float
    ) -> str:
        exp = self._fmt_qty(expected)
        scn = self._fmt_qty(scanned)
        if status == ItemStatus.COMPLETE:
            return f"Tamamlandı ({scn}/{exp})"
        if status == ItemStatus.SHORT:
            return f"Eksik ({scn}/{exp})"
        if status == ItemStatus.OVER:
            return f"Fazla ({scn}/{exp})"
        return f"Bekliyor ({scn}/{exp})"

    def get_shelf_detail(self, shelf: str) -> dict[str, Any]:
        shelf = normalize_depo(shelf)
        items_raw = self.stock.get_shelf_items(shelf)
        items: list[ShelfItem] = []
        stats = ShelfStats(
            shelf=shelf,
            total_etikets=len(items_raw),
            completed_etikets=0,
            short_etikets=0,
            over_etikets=0,
            pending_etikets=0,
            total_expected=0.0,
            total_scanned=0.0,
        )

        seen_scanned: set[str] = set()
        for item in items_raw:
            code = item["etiket"]
            line_id = item["line_id"]
            expected = item["expected"]
            scanned = self._scan_cache.get(line_id, 0.0)
            scanned = self._heal_inflated_scan(line_id, expected, scanned)
            nf = self._not_found_by_line.get(line_id)
            tracking = nf["tracking_status"] if nf else None
            si = ShelfItem(
                line_id=line_id,
                etiket=code,
                expected=expected,
                scanned=scanned,
                extra=item.get("extra", {}),
                tracking_status=tracking,
            )
            items.append(si)
            stats.total_expected += expected
            stats.total_scanned += scanned
            if tracking == CountTrackingStatus.BULUNAMADI.value:
                stats.not_found_etikets += 1
            if si.status == ItemStatus.COMPLETE:
                stats.completed_etikets += 1
            elif si.status == ItemStatus.SHORT:
                stats.short_etikets += 1
            elif si.status == ItemStatus.OVER:
                stats.over_etikets += 1
            else:
                stats.pending_etikets += 1

        return {"shelf": shelf, "items": items, "stats": stats}

    def get_all_shelf_summaries(self) -> list[dict]:
        if not self.stock.is_loaded():
            return []
        summaries = []
        for shelf in self.stock.get_shelves():
            detail = self.get_shelf_detail(shelf)
            stats: ShelfStats = detail["stats"]
            summaries.append(
                {
                    "shelf": shelf,
                    "total_etikets": stats.total_etikets,
                    "completed_etikets": stats.completed_etikets,
                    "short_etikets": stats.short_etikets,
                    "over_etikets": stats.over_etikets,
                    "pending_etikets": stats.pending_etikets,
                    "not_found_etikets": stats.not_found_etikets,
                    "total_expected": stats.total_expected,
                    "total_scanned": stats.total_scanned,
                    "completion_pct": stats.completion_pct,
                }
            )
        return summaries

    @property
    def active_shelf(self) -> Optional[str]:
        return self._active_shelf

    @property
    def active_session_id(self) -> Optional[int]:
        return self._active_session_id
