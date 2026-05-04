"""Migration runner.

Loads numbered ``.sql`` files from this package's ``migrations/`` directory
and applies pending ones in order, tracking applied versions in a
``schema_migrations`` table.
"""

from __future__ import annotations

import re
import sqlite3
from importlib.resources import files
from importlib.resources.abc import Traversable

_FILENAME_RE = re.compile(r"^(\d{4})_[\w\-]+\.sql$")


def _migration_files() -> list[tuple[int, str, Traversable]]:
    root = files("finp.db") / "migrations"
    found: list[tuple[int, str, Traversable]] = []
    for entry in root.iterdir():
        if not entry.is_file():
            continue
        match = _FILENAME_RE.match(entry.name)
        if not match:
            continue
        found.append((int(match.group(1)), entry.name, entry))
    found.sort(key=lambda t: t[0])
    return found


def migrate(conn: sqlite3.Connection) -> list[str]:
    """Apply all pending migrations. Returns the names of applied files.

    Each migration runs inside a single transaction; a failure rolls back
    that file's changes and aborts the run.
    """
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        "  version INTEGER PRIMARY KEY,"
        "  name    TEXT    NOT NULL,"
        "  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
        ")"
    )
    applied = {row[0] for row in conn.execute("SELECT version FROM schema_migrations")}

    ran: list[str] = []
    for version, name, entry in _migration_files():
        if version in applied:
            continue
        sql = entry.read_text(encoding="utf-8")
        conn.executescript(sql)
        conn.execute(
            "INSERT INTO schema_migrations (version, name) VALUES (?, ?)",
            (version, name),
        )
        ran.append(name)
    return ran
