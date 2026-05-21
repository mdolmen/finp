"""Line-delimited JSON-RPC 2.0 server over stdio.

The Tauri Rust shell spawns this process and exchanges newline-terminated
JSON messages over its stdin/stdout. Stderr is reserved for human-readable
logs.

Lifecycle:
    1. Open the SQLite DB at ``$FINP_DB_PATH`` or the OS-default location.
    2. Run pending migrations.
    3. Print a ``ready`` line on stderr.
    4. Loop: read a JSON-RPC request per line, dispatch, write the response.
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import time
import traceback
from typing import Any

from pydantic import BaseModel, ValidationError

from finp import __version__, db
from finp.commands import accounts as account_cmds
from finp.commands import bilan as bilan_cmds
from finp.commands import categories as category_cmds
from finp.commands import gocardless as gocardless_cmds
from finp.commands import imports as import_cmds
from finp.commands import operations as operation_cmds
from finp.commands import planned_operations as planned_cmds
from finp.commands import rules as rule_cmds
from finp.commands._base import Command, EmptyParams
from finp.errors import AppError, to_app_error
from finp.log import enable_debug
from finp.log import setup as setup_logging

_logger = logging.getLogger(__name__)


def _ping(_conn: sqlite3.Connection, _params: EmptyParams) -> dict[str, Any]:
    return {"pong": True, "version": __version__}


METHODS: dict[str, Command] = {
    "ping": Command(EmptyParams, _ping),
    **account_cmds.METHODS,
    **category_cmds.METHODS,
    **operation_cmds.METHODS,
    **rule_cmds.METHODS,
    **import_cmds.METHODS,
    **bilan_cmds.METHODS,
    **planned_cmds.METHODS,
    **gocardless_cmds.METHODS,
}


def _error(req_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"jsonrpc": "2.0", "id": req_id, "error": err}


def _result(req_id: Any, value: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": _serialize(value)}


def _serialize(value: Any) -> Any:
    """Convert pydantic models / lists of models into plain JSON-friendly data."""
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, list):
        return [_serialize(v) for v in value]
    if isinstance(value, dict):
        return {k: _serialize(v) for k, v in value.items()}
    return value


def _handle(conn: sqlite3.Connection, line: str) -> dict[str, Any] | None:
    try:
        req = json.loads(line)
    except json.JSONDecodeError as exc:
        return _error(None, -32700, f"parse error: {exc}")

    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    if not isinstance(method, str):
        return _error(req_id, -32600, "invalid request: missing method")

    cmd = METHODS.get(method)
    if cmd is None:
        return _error(req_id, -32601, f"method not found: {method}")

    try:
        validated = cmd.input_model.model_validate(params)
    except ValidationError as exc:
        return _error(
            req_id,
            -32602,
            "invalid params",
            data={"errors": exc.errors(include_url=False, include_input=False)},
        )

    _logger.debug("→ %s %s", method, params)
    t0 = time.monotonic()
    try:
        result = _result(req_id, cmd.handler(conn, validated))
        elapsed = int((time.monotonic() - t0) * 1000)
        _logger.debug("← %s %dms", method, elapsed)
        return result
    except Exception as exc:
        elapsed = int((time.monotonic() - t0) * 1000)
        app = to_app_error(exc)
        if app is not None:
            _logger.debug("✗ %s %dms %s", method, elapsed, app.code)
            return _error(req_id, -32000, app.message, data={"code": app.code, **(app.data or {})})
        _logger.debug("✗ %s %dms %s", method, elapsed, exc)
        traceback.print_exc(file=sys.stderr)
        return _error(req_id, -32603, "internal error", data={"detail": str(exc)})


def _open_db() -> sqlite3.Connection:
    path = os.environ.get("FINP_DB_PATH") or db.default_db_path()
    conn = db.connect(path)
    db.migrate(conn)
    return conn


def main() -> None:
    """Run the JSON-RPC loop until stdin closes."""
    debug = "--debug" in sys.argv
    setup_logging()
    if debug:
        enable_debug()
    conn = _open_db()
    suffix = " [debug]" if debug else ""
    print(f"finp.rpc ready (version {__version__}){suffix}", file=sys.stderr, flush=True)
    try:
        for raw in sys.stdin:
            line = raw.strip()
            if not line:
                continue
            response = _handle(conn, line)
            if response is not None:
                sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
                sys.stdout.flush()
    finally:
        conn.close()


if __name__ == "__main__":
    main()


__all__ = ["METHODS", "AppError", "Command", "main"]
