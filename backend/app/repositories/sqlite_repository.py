import json
from datetime import datetime, timezone
from typing import Any, Optional

import aiosqlite

from app.core.logging import logger
from app.core.security import hash_password
from app.models.domain import UserRole
from app.repositories.interfaces import SessionRepository

from app.config import settings

DB_PATH = str(settings.database_path)

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'idle',
    started_at TEXT,
    ended_at TEXT,
    started_by INTEGER,
    excel_filename TEXT,
    active_shelf TEXT,
    FOREIGN KEY (started_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS scan_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    shelf TEXT NOT NULL,
    scan_type TEXT NOT NULL,
    expected REAL DEFAULT 0,
    scanned REAL DEFAULT 0,
    scanned_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS unknown_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    shelf TEXT NOT NULL,
    scanned_qty REAL DEFAULT 0,
    user_id INTEGER NOT NULL,
    last_scan_at TEXT NOT NULL,
    UNIQUE(session_id, reference, shelf),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS unassigned_found (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    found_shelf TEXT NOT NULL,
    scanned_qty REAL DEFAULT 0,
    status TEXT DEFAULT 'BULUNDU',
    user_id INTEGER NOT NULL,
    counted_at TEXT NOT NULL,
    UNIQUE(session_id, reference, found_shelf),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    session_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_scan_session ON scan_events(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_ref ON scan_events(session_id, reference, shelf);
CREATE INDEX IF NOT EXISTS idx_unknown_session ON unknown_items(session_id);

CREATE TABLE IF NOT EXISTS misplacement_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    etiket TEXT NOT NULL,
    correct_shelf TEXT NOT NULL,
    scanned_shelf TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Raf uyumsuzluğu',
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_misplacement_session ON misplacement_corrections(session_id);

CREATE TABLE IF NOT EXISTS system_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    filename TEXT,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);

CREATE TABLE IF NOT EXISTS not_found_markings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    line_id TEXT NOT NULL,
    etiket TEXT NOT NULL,
    expected_shelf TEXT NOT NULL,
    expected REAL NOT NULL DEFAULT 0,
    stok_no TEXT DEFAULT '',
    product_name TEXT DEFAULT '',
    tracking_status TEXT NOT NULL DEFAULT 'BULUNAMADI',
    marked_by INTEGER NOT NULL,
    marked_at TEXT NOT NULL,
    resolved_by INTEGER,
    resolved_at TEXT,
    found_shelf TEXT DEFAULT '',
    UNIQUE(session_id, line_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_nf_session_etiket ON not_found_markings(session_id, etiket);
CREATE INDEX IF NOT EXISTS idx_nf_session_status ON not_found_markings(session_id, tracking_status);
"""


class SQLiteSessionRepository(SessionRepository):
    def __init__(self, db_path: str = DB_PATH) -> None:
        self.db_path = db_path

    async def initialize(self) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.executescript(SCHEMA)
            try:
                await db.execute("ALTER TABLE scan_events ADD COLUMN line_id TEXT")
            except Exception:
                pass
            await db.commit()
            await self._seed_users(db)

    async def _seed_users(self, db: aiosqlite.Connection) -> None:
        defaults = [
            ("admin", hash_password("admin123"), UserRole.ADMIN.value),
        ]
        for username, pw_hash, role in defaults:
            await db.execute(
                "INSERT OR IGNORE INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (username, pw_hash, role, datetime.now(timezone.utc).isoformat()),
            )
        await db.commit()

    async def get_user(self, username: str) -> Optional[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM users WHERE username = ?", (username,)
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def create_user(self, username: str, password: str) -> dict:
        username = username.strip()
        if not username:
            raise ValueError("Kullanıcı adı gerekli")
        if len(password) < 4:
            raise ValueError("Şifre en az 4 karakter olmalı")
        now = datetime.now(timezone.utc).isoformat()
        pw_hash = hash_password(password)
        if username.lower() == "admin":
            raise ValueError("Bu kullanıcı adı kullanılamaz")
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id FROM users WHERE username = ?", (username,)
            ) as cur:
                if await cur.fetchone():
                    raise ValueError("Bu kullanıcı adı zaten kullanılıyor")
            await db.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
                (username, pw_hash, UserRole.OPERATOR.value, now),
            )
            await db.commit()
            async with db.execute(
                "SELECT id, username, role, created_at FROM users WHERE username = ?",
                (username,),
            ) as cur:
                row = await cur.fetchone()
                return dict(row)

    async def list_users(self) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT id, username, role, created_at FROM users ORDER BY created_at ASC"
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_user_by_id(self, user_id: int) -> Optional[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def update_user_password(self, user_id: int, password: str) -> dict[str, Any]:
        if len(password) < 4:
            raise ValueError("Şifre en az 4 karakter olmalı")
        pw_hash = hash_password(password)
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT id FROM users WHERE id = ?", (user_id,)) as cur:
                if not await cur.fetchone():
                    raise ValueError("Kullanıcı bulunamadı")
            await db.execute(
                "UPDATE users SET password_hash = ? WHERE id = ?",
                (pw_hash, user_id),
            )
            await db.commit()
            async with db.execute(
                "SELECT id, username, role, created_at FROM users WHERE id = ?",
                (user_id,),
            ) as cur:
                row = await cur.fetchone()
                return dict(row)

    async def delete_user(self, user_id: int) -> dict[str, Any]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute("SELECT * FROM users WHERE id = ?", (user_id,)) as cur:
                row = await cur.fetchone()
                if not row:
                    raise ValueError("Kullanıcı bulunamadı")
                target = dict(row)
            if target["username"].lower() == "admin":
                raise ValueError("Ana admin hesabı silinemez")
            await db.execute("DELETE FROM users WHERE id = ?", (user_id,))
            await db.commit()
            return target

    async def add_system_event(
        self,
        user_id: int,
        action: str,
        details: str,
        filename: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO system_events (user_id, action, filename, details, created_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, action, filename, details, now),
            )
            await db.commit()

    async def get_system_events(self, limit: int = 500) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT e.*, u.username FROM system_events e
                   JOIN users u ON e.user_id = u.id
                   ORDER BY e.created_at DESC LIMIT ?""",
                (limit,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def create_session(
        self, name: str, user_id: int, excel_filename: str
    ) -> int:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET status = 'completed', ended_at = ? WHERE status = 'active'",
                (now,),
            )
            cur = await db.execute(
                """INSERT INTO sessions (name, status, started_at, started_by, excel_filename)
                   VALUES (?, 'active', ?, ?, ?)""",
                (name, now, user_id, excel_filename),
            )
            await db.commit()
            return cur.lastrowid

    async def get_active_session(self) -> Optional[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT s.*, u.username as started_by_name
                   FROM sessions s LEFT JOIN users u ON s.started_by = u.id
                   WHERE s.status = 'active' ORDER BY s.id DESC LIMIT 1"""
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_session(self, session_id: int) -> Optional[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sessions WHERE id = ?", (session_id,)
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_latest_completed_session(self) -> Optional[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM sessions WHERE status = 'completed' ORDER BY id DESC LIMIT 1"
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def get_count_session(self) -> Optional[dict[str, Any]]:
        """Aktif oturum veya en son tamamlanan oturum (düzeltme/rapor için)."""
        session = await self.get_active_session()
        if session:
            return session
        return await self.get_latest_completed_session()

    async def end_session(self, session_id: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET status = 'completed', ended_at = ? WHERE id = ?",
                (now, session_id),
            )
            await db.commit()

    async def set_active_shelf(self, session_id: int, shelf: str) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE sessions SET active_shelf = ? WHERE id = ?",
                (shelf, session_id),
            )
            await db.commit()

    async def record_scan(
        self,
        session_id: int,
        user_id: int,
        reference: str,
        shelf: str,
        scan_type: str,
        expected: float,
        scanned: float,
        line_id: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO scan_events
                   (session_id, user_id, reference, shelf, scan_type, expected, scanned, scanned_at, line_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (session_id, user_id, reference, shelf, scan_type, expected, scanned, now, line_id),
            )
            await db.commit()

    async def get_scan_counts(self, session_id: int) -> dict[tuple[str, str], float]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT reference, shelf, COUNT(*) as cnt
                   FROM scan_events WHERE session_id = ? AND scan_type = 'normal'
                   GROUP BY reference, shelf""",
                (session_id,),
            ) as cur:
                rows = await cur.fetchall()
                return {(r[0], r[1]): float(r[2]) for r in rows}

    async def get_all_scan_counts_by_type(
        self, session_id: int
    ) -> dict[str, dict[tuple[str, str], float] | dict[str, float]]:
        result: dict[str, dict] = {
            "normal": {},
            "unassigned": {},
            "unknown": {},
        }
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT line_id, MAX(scanned) as scanned
                   FROM scan_events
                   WHERE session_id = ? AND scan_type = 'normal' AND line_id IS NOT NULL
                   GROUP BY line_id""",
                (session_id,),
            ) as cur:
                rows = await cur.fetchall()
                for line_id, scanned in rows:
                    result["normal"][line_id] = float(scanned)

            async with db.execute(
                """SELECT scan_type, reference, shelf, MAX(scanned) as scanned
                   FROM scan_events
                   WHERE session_id = ? AND scan_type != 'normal'
                   GROUP BY scan_type, reference, shelf""",
                (session_id,),
            ) as cur:
                rows = await cur.fetchall()
                for scan_type, ref, shelf, scanned in rows:
                    bucket = result.get(scan_type, result["normal"])
                    bucket[(ref, shelf)] = float(scanned)
        return result

    async def upsert_unknown(
        self, session_id: int, reference: str, shelf: str, user_id: int, qty: float
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO unknown_items (session_id, reference, shelf, scanned_qty, user_id, last_scan_at)
                   VALUES (?, ?, ?, ?, ?, ?)
                   ON CONFLICT(session_id, reference, shelf)
                   DO UPDATE SET scanned_qty = scanned_qty + ?, last_scan_at = ?, user_id = ?""",
                (session_id, reference, shelf, qty, user_id, now, qty, now, user_id),
            )
            await db.commit()

    async def upsert_unassigned_found(
        self,
        session_id: int,
        reference: str,
        found_shelf: str,
        user_id: int,
        qty: float,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO unassigned_found
                   (session_id, reference, found_shelf, scanned_qty, status, user_id, counted_at)
                   VALUES (?, ?, ?, ?, 'BULUNDU', ?, ?)
                   ON CONFLICT(session_id, reference, found_shelf)
                   DO UPDATE SET scanned_qty = scanned_qty + ?, counted_at = ?, user_id = ?""",
                (
                    session_id,
                    reference,
                    found_shelf,
                    qty,
                    user_id,
                    now,
                    qty,
                    now,
                    user_id,
                ),
            )
            await db.commit()

    async def get_unknown_items(self, session_id: int) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT u.*, us.username FROM unknown_items u
                   JOIN users us ON u.user_id = us.id
                   WHERE u.session_id = ? ORDER BY u.last_scan_at DESC""",
                (session_id,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_unassigned_found(self, session_id: int) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT u.*, us.username FROM unassigned_found u
                   JOIN users us ON u.user_id = us.id
                   WHERE u.session_id = ? ORDER BY u.counted_at DESC""",
                (session_id,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def record_correction(
        self,
        session_id: int,
        user_id: int,
        etiket: str,
        scanned_shelf: str,
        status: str,
        correct_shelf: str = "",
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """INSERT INTO misplacement_corrections
                   (session_id, user_id, etiket, correct_shelf, scanned_shelf, status, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (session_id, user_id, etiket, correct_shelf or "", scanned_shelf, status, now),
            )
            await db.commit()

    async def record_misplacement(
        self,
        session_id: int,
        user_id: int,
        etiket: str,
        correct_shelf: str,
        scanned_shelf: str,
    ) -> None:
        await self.record_correction(
            session_id,
            user_id,
            etiket,
            scanned_shelf,
            "Raf uyumsuzluğu",
            correct_shelf,
        )

    async def get_misplacements(self, session_id: int) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT m.*, u.username FROM misplacement_corrections m
                   JOIN users u ON m.user_id = u.id
                   WHERE m.session_id = ? ORDER BY m.created_at DESC""",
                (session_id,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_all_misplacements(self) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT m.*, u.username FROM misplacement_corrections m
                   JOIN users u ON m.user_id = u.id
                   ORDER BY m.created_at DESC"""
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_correction_by_id(self, correction_id: int) -> Optional[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT m.*, u.username FROM misplacement_corrections m
                   JOIN users u ON m.user_id = u.id
                   WHERE m.id = ?""",
                (correction_id,),
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def delete_correction_by_id(self, correction_id: int) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "DELETE FROM misplacement_corrections WHERE id = ?",
                (correction_id,),
            )
            await db.commit()

    async def delete_latest_scan_event(
        self,
        session_id: int,
        reference: str,
        shelf: str,
        scan_type: str,
    ) -> bool:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT id FROM scan_events
                   WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = ?
                   ORDER BY scanned_at DESC LIMIT 1""",
                (session_id, reference, shelf, scan_type),
            ) as cur:
                row = await cur.fetchone()
            if not row:
                return False
            await db.execute("DELETE FROM scan_events WHERE id = ?", (row[0],))
            await db.commit()
            return True

    async def sync_unknown_item_qty(
        self, session_id: int, reference: str, shelf: str
    ) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT MAX(scanned) FROM scan_events
                   WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = 'unknown'""",
                (session_id, reference, shelf),
            ) as cur:
                row = await cur.fetchone()
                qty = float(row[0]) if row and row[0] is not None else 0.0
            if qty <= 0:
                await db.execute(
                    """DELETE FROM unknown_items
                       WHERE session_id = ? AND reference = ? AND shelf = ?""",
                    (session_id, reference, shelf),
                )
            else:
                await db.execute(
                    """UPDATE unknown_items SET scanned_qty = ?
                       WHERE session_id = ? AND reference = ? AND shelf = ?""",
                    (qty, session_id, reference, shelf),
                )
            await db.commit()

    async def sync_unassigned_found_qty(
        self, session_id: int, reference: str, found_shelf: str
    ) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                """SELECT MAX(scanned) FROM scan_events
                   WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = 'unassigned'""",
                (session_id, reference, found_shelf),
            ) as cur:
                row = await cur.fetchone()
                qty = float(row[0]) if row and row[0] is not None else 0.0
            if qty <= 0:
                await db.execute(
                    """DELETE FROM unassigned_found
                       WHERE session_id = ? AND reference = ? AND found_shelf = ?""",
                    (session_id, reference, found_shelf),
                )
            else:
                await db.execute(
                    """UPDATE unassigned_found SET scanned_qty = ?
                       WHERE session_id = ? AND reference = ? AND found_shelf = ?""",
                    (qty, session_id, reference, found_shelf),
                )
            await db.commit()

    async def insert_not_found_marking(
        self,
        session_id: int,
        line_id: str,
        etiket: str,
        expected_shelf: str,
        expected: float,
        stok_no: str,
        product_name: str,
        user_id: int,
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute(
                """INSERT INTO not_found_markings
                   (session_id, line_id, etiket, expected_shelf, expected, stok_no,
                    product_name, tracking_status, marked_by, marked_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'BULUNAMADI', ?, ?)""",
                (
                    session_id,
                    line_id,
                    etiket,
                    expected_shelf,
                    expected,
                    stok_no,
                    product_name,
                    user_id,
                    now,
                ),
            )
            await db.commit()
            async with db.execute(
                "SELECT * FROM not_found_markings WHERE session_id = ? AND line_id = ?",
                (session_id, line_id),
            ) as cur:
                row = await cur.fetchone()
                return dict(row)

    async def get_not_found_markings(
        self, session_id: int, status: Optional[str] = None
    ) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            if status:
                query = """SELECT n.*, u.username as marked_by_name,
                                  ru.username as resolved_by_name
                           FROM not_found_markings n
                           JOIN users u ON n.marked_by = u.id
                           LEFT JOIN users ru ON n.resolved_by = ru.id
                           WHERE n.session_id = ? AND n.tracking_status = ?
                           ORDER BY n.marked_at DESC"""
                params: tuple[Any, ...] = (session_id, status)
            else:
                query = """SELECT n.*, u.username as marked_by_name,
                                  ru.username as resolved_by_name
                           FROM not_found_markings n
                           JOIN users u ON n.marked_by = u.id
                           LEFT JOIN users ru ON n.resolved_by = ru.id
                           WHERE n.session_id = ?
                           ORDER BY n.marked_at DESC"""
                params = (session_id,)
            async with db.execute(query, params) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_not_found_recoveries(self, session_id: int) -> list[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT n.*, u.username as marked_by_name,
                          ru.username as resolved_by_name
                   FROM not_found_markings n
                   JOIN users u ON n.marked_by = u.id
                   LEFT JOIN users ru ON n.resolved_by = ru.id
                   WHERE n.session_id = ?
                     AND n.tracking_status IN ('SONRADAN_BULUNDU', 'TEKRAR_BULUNDU')
                   ORDER BY n.resolved_at DESC""",
                (session_id,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def get_not_found_by_line(
        self, session_id: int, line_id: str
    ) -> Optional[dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                "SELECT * FROM not_found_markings WHERE session_id = ? AND line_id = ?",
                (session_id, line_id),
            ) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def update_not_found_status(
        self,
        marking_id: int,
        tracking_status: str,
        resolved_by: int,
        found_shelf: str = "",
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """UPDATE not_found_markings
                   SET tracking_status = ?, resolved_by = ?, resolved_at = ?, found_shelf = ?
                   WHERE id = ?""",
                (tracking_status, resolved_by, now, found_shelf, marking_id),
            )
            await db.commit()

    async def delete_not_found_marking(self, marking_id: int) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM not_found_markings WHERE id = ?", (marking_id,))
            await db.commit()

    async def get_scan_events(self, session_id: int) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(
                """SELECT se.*, u.username FROM scan_events se
                   JOIN users u ON se.user_id = u.id
                   WHERE se.session_id = ? ORDER BY se.scanned_at""",
                (session_id,),
            ) as cur:
                return [dict(r) for r in await cur.fetchall()]

    async def reset_all_count_data(self) -> None:
        """Sayım veritabanını sıfırla — oturumlar, okutmalar, bilinmeyen kayıtlar."""
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM scan_events")
            await db.execute("DELETE FROM unknown_items")
            await db.execute("DELETE FROM unassigned_found")
            await db.execute("DELETE FROM misplacement_corrections")
            await db.execute("DELETE FROM not_found_markings")
            await db.execute(
                "UPDATE sessions SET status = 'completed', ended_at = ? WHERE status = 'active'",
                (now,),
            )
            await db.commit()
        logger.info("Sayım veritabanı sıfırlandı.")

    async def add_audit_log(
        self, user_id: int, action: str, details: str, session_id: Optional[int] = None
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO audit_logs (user_id, session_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)",
                (user_id, session_id, action, details, now),
            )
            await db.commit()

    async def get_audit_logs(self, session_id: Optional[int] = None) -> list[dict]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            if session_id:
                query = "SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE a.session_id = ? ORDER BY a.created_at DESC"
                params = (session_id,)
            else:
                query = "SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT 500"
                params = ()
            async with db.execute(query, params) as cur:
                return [dict(r) for r in await cur.fetchall()]
