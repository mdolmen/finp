"""SQLite connection helpers.

The DB file lives under an OS-appropriate user data directory so the desktop
app stays self-contained per user. Tests pass ``":memory:"`` or a tmp path.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path


def default_db_path() -> Path:
    """Return the platform-conventional path to the user's finp DB file."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming"))
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share"))
    return base / "finp" / "finp.db"


def connect(path: Path | str = ":memory:") -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and foreign keys enabled.

    Args:
        path: Filesystem path or ``":memory:"``. Parent dirs are created.

    Returns:
        A ``sqlite3.Connection`` with ``Row`` factory set.
    """
    if isinstance(path, Path) or (isinstance(path, str) and path != ":memory:"):
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        path = str(p)

    conn = sqlite3.connect(path, detect_types=sqlite3.PARSE_DECLTYPES, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    if path != ":memory:":
        conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn
