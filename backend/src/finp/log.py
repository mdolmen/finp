"""Logging setup for the finp backend.

Writes to a rotating log file alongside the DB (finp.log in the same directory).
Call ``setup()`` once at process startup; all modules use standard
``logging.getLogger(__name__)`` after that.

When the sidecar is started with ``--debug``, call ``enable_debug()`` after
``setup()`` to additionally mirror DEBUG output to stderr and a second
rotating file (finp-debug.log, 5 MB, 1 backup).
"""

from __future__ import annotations

import logging
import logging.handlers
import os
import sys
from pathlib import Path


def _data_dir() -> Path:
    db_path = os.environ.get("FINP_DB_PATH")
    if db_path:
        return Path(db_path).parent
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "finp"
    elif sys.platform == "win32":
        base = Path(os.environ.get("APPDATA") or (Path.home() / "AppData" / "Roaming")) / "finp"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share")) / "finp"
    base.mkdir(parents=True, exist_ok=True)
    return base


def setup(level: int = logging.DEBUG) -> None:
    """Configure root logger with a rotating file handler (always-on)."""
    path = _data_dir() / "finp.log"
    handler = logging.handlers.RotatingFileHandler(
        path, maxBytes=5 * 1024 * 1024, backupCount=2, encoding="utf-8"
    )
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(level)
    if not any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
        root.addHandler(handler)


def enable_debug() -> None:
    """Add stderr + finp-debug.log handlers for verbose debug output.

    Safe to call multiple times — idempotent via handler-type checks.
    """
    fmt = logging.Formatter("%(asctime)s %(levelname)-8s %(name)s: %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    # Rotating debug file (separate from the always-on finp.log).
    debug_path = _data_dir() / "finp-debug.log"
    if not any(
        isinstance(h, logging.handlers.RotatingFileHandler)
        and getattr(h, "baseFilename", "").endswith("finp-debug.log")
        for h in root.handlers
    ):
        file_handler = logging.handlers.RotatingFileHandler(
            debug_path, maxBytes=5 * 1024 * 1024, backupCount=1, encoding="utf-8"
        )
        file_handler.setFormatter(fmt)
        root.addHandler(file_handler)

    # Mirror to stderr so Tauri's console shows live output in dev.
    already_stderr = any(
        isinstance(h, logging.StreamHandler) and h.stream is sys.stderr for h in root.handlers
    )
    if not already_stderr:
        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setFormatter(fmt)
        root.addHandler(stderr_handler)
