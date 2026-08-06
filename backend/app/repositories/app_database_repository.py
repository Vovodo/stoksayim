import json
from datetime import datetime, timezone
from typing import Any, Optional

import aiosqlite
import asyncpg

from app.config import settings
from app.core.logging import logger
from app.core.security import hash_password
from app.models.domain import UserRole
from app.repositories.sqlite_repository import SCHEMA, SQLiteSessionRepository

POSTGRES_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
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
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    shelf TEXT NOT NULL,
    scan_type TEXT NOT NULL,
    expected DOUBLE PRECISION DEFAULT 0,
    scanned DOUBLE PRECISION DEFAULT 0,
    scanned_at TEXT NOT NULL,
    line_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS unknown_items (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    shelf TEXT NOT NULL,
    scanned_qty DOUBLE PRECISION DEFAULT 0,
    user_id INTEGER NOT NULL,
    last_scan_at TEXT NOT NULL,
    UNIQUE(session_id, reference, shelf),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS unassigned_found (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    reference TEXT NOT NULL,
    found_shelf TEXT NOT NULL,
    scanned_qty DOUBLE PRECISION DEFAULT 0,
    status TEXT DEFAULT 'BULUNDU',
    user_id INTEGER NOT NULL,
    counted_at TEXT NOT NULL,
    UNIQUE(session_id, reference, found_shelf),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER,
    session_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_scan_session ON scan_events(session_id);
CREATE INDEX IF NOT EXISTS idx_scan_ref ON scan_events(session_id, reference, shelf);
CREATE INDEX IF NOT EXISTS idx_unknown_session ON unknown_items(session_id);

CREATE TABLE IF NOT EXISTS misplacement_corrections (
    id SERIAL PRIMARY KEY,
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
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    filename TEXT,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_system_events_created ON system_events(created_at DESC);

CREATE TABLE IF NOT EXISTS not_found_markings (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL,
    line_id TEXT NOT NULL,
    etiket TEXT NOT NULL,
    expected_shelf TEXT NOT NULL,
    expected DOUBLE PRECISION NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
);
"""


def _prepare_sql(sql: str) -> str:
    parts = sql.split("?")
    if len(parts) == 1:
        return sql
    out = []
    for i, p in enumerate(parts[:-1]):
        out.append(f"{p}${i+1}")
    out.append(parts[-1])
    return "".join(out)


class AppDatabaseRepository(SQLiteSessionRepository):
    def __init__(self) -> None:
        super().__init__()
        self.pg_pool: Optional[asyncpg.Pool] = None
        self.use_postgres = False

    async def initialize(self) -> None:
        raw_url = settings.database_url
        if raw_url and raw_url.strip():
            try:
                pg_url = raw_url.strip().replace("postgresql+asyncpg://", "postgresql://")
                self.pg_pool = await asyncpg.create_pool(pg_url, min_size=1, max_size=10, timeout=10)
                self.use_postgres = True
                async with self.pg_pool.acquire() as conn:
                    for statement in POSTGRES_SCHEMA.strip().split(";"):
                        stmt = statement.strip()
                        if stmt:
                            await conn.execute(stmt)
                    await self._seed_pg_users(conn)
                logger.info("PostgreSQL veritabanı aktif (Supabase/Postgres).")
                return
            except Exception as exc:
                logger.error("PostgreSQL bağlantı hatası: %s — SQLite yedek veritabanına geçiliyor.", exc)
                self.use_postgres = False

        await super().initialize()

    async def _execute(self, sql: str, params: tuple = ()) -> None:
        if self.use_postgres and self.pg_pool:
            pg_sql = _prepare_sql(sql)
            async with self.pg_pool.acquire() as conn:
                await conn.execute(pg_sql, *params)
            return
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, params)
            await db.commit()

    async def _fetch_all(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        if self.use_postgres and self.pg_pool:
            pg_sql = _prepare_sql(sql)
            async with self.pg_pool.acquire() as conn:
                rows = await conn.fetch(pg_sql, *params)
                return [dict(r) for r in rows]
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(sql, params) as cur:
                rows = await cur.fetchall()
                return [dict(r) for r in rows]

    async def _fetch_one(self, sql: str, params: tuple = ()) -> Optional[dict[str, Any]]:
        if self.use_postgres and self.pg_pool:
            pg_sql = _prepare_sql(sql)
            async with self.pg_pool.acquire() as conn:
                row = await conn.fetchrow(pg_sql, *params)
                return dict(row) if row else None
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            async with db.execute(sql, params) as cur:
                row = await cur.fetchone()
                return dict(row) if row else None

    async def _seed_pg_users(self, conn: asyncpg.Connection) -> None:
        new_username = "apae1111"
        new_password_hash = hash_password("twjsQ0_vay")
        admin_role = UserRole.ADMIN.value

        row = await conn.fetchrow(
            "SELECT id FROM users WHERE username = 'admin' OR username = $1 OR role = $2",
            new_username,
            admin_role,
        )
        if row:
            await conn.execute(
                "UPDATE users SET username = $1, password_hash = $2, role = $3 WHERE id = $4",
                new_username,
                new_password_hash,
                admin_role,
                row["id"],
            )
        else:
            await conn.execute(
                "INSERT INTO users (username, password_hash, role, created_at) VALUES ($1, $2, $3, $4)",
                new_username,
                new_password_hash,
                admin_role,
                datetime.now(timezone.utc).isoformat(),
            )

    async def get_setting(self, key: str) -> Optional[str]:
        row = await self._fetch_one("SELECT value FROM app_settings WHERE key = ?", (key,))
        return row["value"] if row and row.get("value") else None

    async def set_setting(self, key: str, value: Optional[str]) -> None:
        now = datetime.now(timezone.utc).isoformat()
        if value is None or value == "":
            await self._execute("DELETE FROM app_settings WHERE key = ?", (key,))
        else:
            if self.use_postgres:
                await self._execute(
                    """
                    INSERT INTO app_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT (key) DO UPDATE
                    SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
                    """,
                    (key, str(value), now),
                )
            else:
                await self._execute(
                    """
                    INSERT INTO app_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT (key) DO UPDATE
                    SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (key, str(value), now),
                )

    async def delete_setting(self, key: str) -> None:
        await self.set_setting(key, None)

    async def get_user(self, username: str) -> Optional[dict]:
        return await self._fetch_one("SELECT * FROM users WHERE username = ?", (username,))

    async def get_user_by_id(self, user_id: int) -> Optional[dict]:
        return await self._fetch_one("SELECT id, username, role, created_at FROM users WHERE id = ?", (user_id,))

    async def list_users(self) -> list[dict[str, Any]]:
        return await self._fetch_all("SELECT id, username, role, created_at FROM users ORDER BY created_at ASC")

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
        existing = await self._fetch_one("SELECT id FROM users WHERE username = ?", (username,))
        if existing:
            raise ValueError("Bu kullanıcı adı zaten kullanılıyor")
        await self._execute(
            "INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)",
            (username, pw_hash, UserRole.OPERATOR.value, now),
        )
        res = await self._fetch_one("SELECT id, username, role, created_at FROM users WHERE username = ?", (username,))
        return res or {}

    async def update_user_password(self, user_id: int, password: str) -> dict:
        if len(password) < 4:
            raise ValueError("Şifre en az 4 karakter olmalı")
        pw_hash = hash_password(password)
        await self._execute("UPDATE users SET password_hash = ? WHERE id = ?", (pw_hash, user_id))
        res = await self._fetch_one("SELECT id, username, role, created_at FROM users WHERE id = ?", (user_id,))
        if not res:
            raise ValueError("Kullanıcı bulunamadı")
        return res

    async def delete_user(self, user_id: int) -> None:
        user = await self.get_user_by_id(user_id)
        if not user:
            raise ValueError("Kullanıcı bulunamadı")
        if user.get("role") == UserRole.ADMIN.value or user.get("username") in ("admin", "apae1111"):
            raise ValueError("Yönetici kullanıcısı silinemez")
        await self._execute("DELETE FROM users WHERE id = ?", (user_id,))

    async def create_session(self, name: str, started_by: int, excel_filename: Optional[str] = None) -> dict:
        active = await self.get_active_session()
        if active:
            raise ValueError(f"Zaten aktif bir sayım var: {active['name']}")
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            "INSERT INTO sessions (name, status, started_at, started_by, excel_filename) VALUES (?, 'active', ?, ?, ?)",
            (name, now, started_by, excel_filename),
        )
        res = await self.get_active_session()
        return res or {}

    async def end_session(self, session_id: int) -> dict:
        sess = await self._fetch_one("SELECT * FROM sessions WHERE id = ?", (session_id,))
        if not sess:
            raise ValueError(f"Oturum bulunamadı: {session_id}")
        now = datetime.now(timezone.utc).isoformat()
        await self._execute("UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?", (now, session_id))
        res = await self._fetch_one("SELECT * FROM sessions WHERE id = ?", (session_id,))
        return res or {}

    async def get_session(self, session_id: int) -> Optional[dict]:
        return await self._fetch_one("SELECT * FROM sessions WHERE id = ?", (session_id,))

    async def get_all_sessions(self) -> list[dict]:
        return await self._fetch_all("SELECT * FROM sessions ORDER BY id DESC")

    async def get_active_session(self) -> Optional[dict]:
        return await self._fetch_one("SELECT * FROM sessions WHERE status = 'active' ORDER BY id DESC")

    async def set_active_shelf(self, session_id: int, shelf: Optional[str]) -> None:
        await self._execute("UPDATE sessions SET active_shelf = ? WHERE id = ?", (shelf, session_id))

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
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            """
            INSERT INTO scan_events (session_id, user_id, reference, shelf, scan_type, expected, scanned, scanned_at, line_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, reference, shelf, scan_type, expected, scanned, now, line_id),
        )
        return {
            "session_id": session_id,
            "user_id": user_id,
            "reference": reference,
            "shelf": shelf,
            "scan_type": scan_type,
            "expected": expected,
            "scanned": scanned,
            "line_id": line_id,
            "scanned_at": now,
        }

    async def get_all_scan_counts_by_type(
        self, session_id: int
    ) -> dict[str, dict[Any, float]]:
        result: dict[str, dict] = {
            "normal": {},
            "unassigned": {},
            "unknown": {},
        }
        rows_normal = await self._fetch_all(
            """SELECT line_id, MAX(scanned) as scanned
               FROM scan_events
               WHERE session_id = ? AND scan_type = 'normal' AND line_id IS NOT NULL
               GROUP BY line_id""",
            (session_id,),
        )
        for r in rows_normal:
            lid = r.get("line_id")
            if lid:
                result["normal"][lid] = float(r.get("scanned") or 0.0)

        rows_other = await self._fetch_all(
            """SELECT scan_type, reference, shelf, MAX(scanned) as scanned
               FROM scan_events
               WHERE session_id = ? AND scan_type != 'normal'
               GROUP BY scan_type, reference, shelf""",
            (session_id,),
        )
        for r in rows_other:
            st = r.get("scan_type")
            bucket = result.get(st, result["normal"])
            ref = r.get("reference") or ""
            sh = r.get("shelf") or ""
            bucket[(ref, sh)] = float(r.get("scanned") or 0.0)

        return result

    async def record_misplacement(
        self,
        session_id: int,
        user_id: int,
        etiket: str,
        correct_shelf: str,
        scanned_shelf: str,
        status: str = "Raf uyumsuzluğu",
    ) -> dict:
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            """
            INSERT INTO misplacement_corrections (session_id, user_id, etiket, correct_shelf, scanned_shelf, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, user_id, etiket, correct_shelf, scanned_shelf, status, now),
        )
        rows = await self._fetch_all("SELECT * FROM misplacement_corrections WHERE session_id = ? ORDER BY id DESC", (session_id,))
        return rows[0] if rows else {}

    async def get_misplacements(self, session_id: int) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT m.*, u.username
            FROM misplacement_corrections m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.session_id = ?
            ORDER BY m.created_at DESC
            """,
            (session_id,),
        )

    async def get_all_misplacements(self) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT m.*, u.username
            FROM misplacement_corrections m
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.created_at DESC
            """
        )

    async def get_correction_by_id(self, correction_id: int) -> Optional[dict[str, Any]]:
        return await self._fetch_one(
            """
            SELECT m.*, u.username
            FROM misplacement_corrections m
            LEFT JOIN users u ON m.user_id = u.id
            WHERE m.id = ?
            """,
            (correction_id,),
        )

    async def delete_correction_by_id(self, correction_id: int) -> None:
        await self._execute(
            "DELETE FROM misplacement_corrections WHERE id = ?",
            (correction_id,),
        )

    async def delete_latest_scan_event(
        self,
        session_id: int,
        reference: str,
        shelf: str,
        scan_type: str,
    ) -> bool:
        row = await self._fetch_one(
            """SELECT id FROM scan_events
               WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = ?
               ORDER BY scanned_at DESC LIMIT 1""",
            (session_id, reference, shelf, scan_type),
        )
        if not row:
            return False
        row_id = row.get("id") if isinstance(row, dict) else row[0]
        await self._execute("DELETE FROM scan_events WHERE id = ?", (row_id,))
        return True

    async def sync_unknown_item_qty(
        self, session_id: int, reference: str, shelf: str
    ) -> None:
        row = await self._fetch_one(
            """SELECT MAX(scanned) as max_scanned FROM scan_events
               WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = 'unknown'""",
            (session_id, reference, shelf),
        )
        max_val = row.get("max_scanned") if isinstance(row, dict) else None
        qty = float(max_val) if max_val is not None else 0.0
        if qty <= 0:
            await self._execute(
                """DELETE FROM unknown_items
                   WHERE session_id = ? AND reference = ? AND shelf = ?""",
                (session_id, reference, shelf),
            )
        else:
            await self._execute(
                """UPDATE unknown_items SET scanned_qty = ?
                   WHERE session_id = ? AND reference = ? AND shelf = ?""",
                (qty, session_id, reference, shelf),
            )

    async def sync_unassigned_found_qty(
        self, session_id: int, reference: str, found_shelf: str
    ) -> None:
        row = await self._fetch_one(
            """SELECT MAX(scanned) as max_scanned FROM scan_events
               WHERE session_id = ? AND reference = ? AND shelf = ? AND scan_type = 'unassigned'""",
            (session_id, reference, found_shelf),
        )
        max_val = row.get("max_scanned") if isinstance(row, dict) else None
        qty = float(max_val) if max_val is not None else 0.0
        if qty <= 0:
            await self._execute(
                """DELETE FROM unassigned_found
                   WHERE session_id = ? AND reference = ? AND found_shelf = ?""",
                (session_id, reference, found_shelf),
            )
        else:
            await self._execute(
                """UPDATE unassigned_found SET scanned_qty = ?
                   WHERE session_id = ? AND reference = ? AND found_shelf = ?""",
                (qty, session_id, reference, found_shelf),
            )

    async def get_unknown_items(self, session_id: int) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT uk.*, u.username
            FROM unknown_items uk
            JOIN users u ON uk.user_id = u.id
            WHERE uk.session_id = ?
            ORDER BY uk.last_scan_at DESC
            """,
            (session_id,),
        )

    async def get_unassigned_found(self, session_id: int) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT uf.*, u.username
            FROM unassigned_found uf
            JOIN users u ON uf.user_id = u.id
            WHERE uf.session_id = ?
            ORDER BY uf.counted_at DESC
            """,
            (session_id,),
        )

    async def insert_not_found_marking(
        self,
        session_id: int,
        line_id: str,
        etiket: str,
        expected_shelf: str,
        expected: float,
        stok_no: str,
        product_name: str,
        marked_by: int,
        tracking_status: str = "BULUNAMADI",
    ) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        if self.use_postgres:
            await self._execute(
                """
                INSERT INTO not_found_markings (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, tracking_status, marked_by, marked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (session_id, line_id) DO UPDATE SET
                    tracking_status = EXCLUDED.tracking_status,
                    marked_by = EXCLUDED.marked_by,
                    marked_at = EXCLUDED.marked_at,
                    resolved_by = NULL,
                    resolved_at = NULL,
                    found_shelf = ''
                """,
                (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, tracking_status, marked_by, now),
            )
        else:
            await self._execute(
                """
                INSERT INTO not_found_markings (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, tracking_status, marked_by, marked_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT (session_id, line_id) DO UPDATE SET
                    tracking_status = excluded.tracking_status,
                    marked_by = excluded.marked_by,
                    marked_at = excluded.marked_at,
                    resolved_by = NULL,
                    resolved_at = NULL,
                    found_shelf = ''
                """,
                (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, tracking_status, marked_by, now),
            )
        return {
            "id": 0,
            "session_id": session_id,
            "line_id": line_id,
            "etiket": etiket,
            "expected_shelf": expected_shelf,
            "expected": expected,
            "stok_no": stok_no,
            "product_name": product_name,
            "tracking_status": tracking_status,
            "marked_by": marked_by,
            "marked_at": now,
        }

    async def insert_not_found_markings_batch(
        self,
        items: list[tuple[int, str, str, str, float, str, str, int, str, str]],
    ) -> list[dict[str, Any]]:
        if not items:
            return []

        sql_pg = """
            INSERT INTO not_found_markings (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, marked_by, marked_at, tracking_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (session_id, line_id) DO UPDATE SET
                tracking_status = EXCLUDED.tracking_status,
                marked_by = EXCLUDED.marked_by,
                marked_at = EXCLUDED.marked_at,
                resolved_by = NULL,
                resolved_at = NULL,
                found_shelf = ''
        """
        sql_sqlite = """
            INSERT INTO not_found_markings (session_id, line_id, etiket, expected_shelf, expected, stok_no, product_name, marked_by, marked_at, tracking_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (session_id, line_id) DO UPDATE SET
                tracking_status = excluded.tracking_status,
                marked_by = excluded.marked_by,
                marked_at = excluded.marked_at,
                resolved_by = NULL,
                resolved_at = NULL,
                found_shelf = ''
        """
        sql = sql_pg if self.use_postgres else sql_sqlite

        if self.use_postgres and self.pg_pool:
            prepared = _prepare_sql(sql)
            async with self.pg_pool.acquire() as conn:
                await conn.executemany(prepared, items)
        else:
            async with aiosqlite.connect(self.db_path) as db:
                await db.executemany(sql, items)
                await db.commit()

        return [
            {
                "id": 0,
                "session_id": item[0],
                "line_id": item[1],
                "etiket": item[2],
                "expected_shelf": item[3],
                "expected": item[4],
                "stok_no": item[5],
                "product_name": item[6],
                "marked_by": item[7],
                "marked_at": item[8],
                "tracking_status": item[9],
            }
            for item in items
        ]

    async def get_not_found_by_line(
        self, session_id: int, line_id: str
    ) -> Optional[dict[str, Any]]:
        return await self._fetch_one(
            """
            SELECT nf.*, u.username as marked_by_name
            FROM not_found_markings nf
            LEFT JOIN users u ON nf.marked_by = u.id
            WHERE nf.session_id = ? AND nf.line_id = ?
            """,
            (session_id, line_id),
        )

    async def update_not_found_status(
        self,
        marking_id: int,
        tracking_status: str,
        resolved_by: int,
        found_shelf: str = "",
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            """UPDATE not_found_markings
               SET tracking_status = ?, resolved_by = ?, resolved_at = ?, found_shelf = ?
               WHERE id = ?""",
            (tracking_status, resolved_by, now, found_shelf, marking_id),
        )

    async def delete_not_found_marking(self, marking_id: int) -> None:
        await self._execute("DELETE FROM not_found_markings WHERE id = ?", (marking_id,))

    async def get_not_found_markings(
        self, session_id: int, status: Optional[str] = None
    ) -> list[dict[str, Any]]:
        if status:
            return await self._fetch_all(
                """
                SELECT nf.*, u.username as marked_by_name
                FROM not_found_markings nf
                LEFT JOIN users u ON nf.marked_by = u.id
                WHERE nf.session_id = ? AND nf.tracking_status = ?
                ORDER BY nf.marked_at DESC
                """,
                (session_id, status),
            )
        return await self._fetch_all(
            """
            SELECT nf.*, u.username as marked_by_name
            FROM not_found_markings nf
            LEFT JOIN users u ON nf.marked_by = u.id
            WHERE nf.session_id = ?
            ORDER BY nf.marked_at DESC
            """,
            (session_id,),
        )

    async def get_not_found_recoveries(self, session_id: int) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT nf.*, u1.username as marked_by_username, u2.username as resolved_by_username
            FROM not_found_markings nf
            LEFT JOIN users u1 ON nf.marked_by = u1.id
            LEFT JOIN users u2 ON nf.resolved_by = u2.id
            WHERE nf.session_id = ? AND nf.tracking_status != 'BULUNAMADI'
            ORDER BY nf.resolved_at DESC
            """,
            (session_id,),
        )

    async def add_audit_log(
        self,
        user_id: Optional[int],
        action: str,
        details: Optional[str] = None,
        session_id: Optional[int] = None,
    ) -> None:
        sess_id = session_id
        if sess_id is None and self.pg_pool:
            # Skip extra query if session_id is provided
            active = await self.get_active_session()
            sess_id = active["id"] if active else None
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            "INSERT INTO audit_logs (user_id, session_id, action, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, sess_id, action, details, now),
        )

    async def add_system_event(
        self,
        user_id: int,
        action: str,
        details: str,
        filename: Optional[str] = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        await self._execute(
            "INSERT INTO system_events (user_id, action, filename, details, created_at) VALUES (?, ?, ?, ?, ?)",
            (user_id, action, filename, details, now),
        )

    async def get_system_events(self) -> list[dict[str, Any]]:
        return await self._fetch_all(
            """
            SELECT s.id, u.username, s.action, s.filename, s.details, s.created_at
            FROM system_events s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.created_at DESC
            """,
        )
