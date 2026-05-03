"""Line-delimited JSON-RPC 2.0 server over stdio.

The Tauri Rust shell spawns this process and exchanges newline-terminated JSON
messages over its stdin/stdout. Stderr is reserved for human-readable logs.
"""

from __future__ import annotations

import json
import sys
from collections.abc import Callable
from typing import Any

from finp import __version__


def _ping(_params: dict[str, Any]) -> dict[str, Any]:
    return {"pong": True, "version": __version__}


METHODS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "ping": _ping,
}


def _error(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _result(req_id: Any, value: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": value}


def _handle(line: str) -> dict[str, Any] | None:
    try:
        req = json.loads(line)
    except json.JSONDecodeError as exc:
        return _error(None, -32700, f"parse error: {exc}")

    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params") or {}

    if not isinstance(method, str):
        return _error(req_id, -32600, "invalid request: missing method")

    handler = METHODS.get(method)
    if handler is None:
        return _error(req_id, -32601, f"method not found: {method}")

    try:
        return _result(req_id, handler(params))
    except Exception as exc:
        return _error(req_id, -32000, f"{type(exc).__name__}: {exc}")


def main() -> None:
    """Run the JSON-RPC loop until stdin closes."""
    print(f"finp.rpc ready (version {__version__})", file=sys.stderr, flush=True)
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        response = _handle(line)
        if response is not None:
            sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
