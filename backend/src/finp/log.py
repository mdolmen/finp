"""Logging setup for the finp backend.

Writes to a rotating log file alongside the DB (finp.log in the same directory).
Call ``setup()`` once at process startup; all modules use standard
``logging.getLogger(__name__)`` after that.
"""

from __future__ import annotations

import logging
import logging.handlers
import os
from pathlib import Path


def _log_path() -> Path:
    db_path = os.environ.get("FINP_DB_PATH")
    if db_path:
        return Path(db_path).parent / "finp.log"
    if os.sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "finp"
    elif os.sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")) / "finp"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share")) / "finp"
    base.mkdir(parents=True, exist_ok=True)
    return base / "finp.log"


def setup(level: int = logging.DEBUG) -> None:
    """Configure root logger with a rotating file handler."""
    path = _log_path()
    handler = logging.handlers.RotatingFileHandler(
        path, maxBytes=5 * 1024 * 1024, backupCount=2, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(level)
    if not any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
        root.addHandler(handler)
