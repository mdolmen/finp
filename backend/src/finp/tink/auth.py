"""Tink OAuth2 authorization-code flow helpers.

Lifecycle
---------
1. ``start_oauth_server`` picks a free port, starts a background HTTP server,
   and returns ``(auth_url, state)``.
2. The caller opens *auth_url* in the user's browser.
3. After consent, Tink redirects to ``http://localhost:{port}/callback``.
4. The background server exchanges the code for tokens, stores them in the DB,
   and marks the session complete.
5. ``get_oauth_status(state)`` is polled until status != "pending".
"""

from __future__ import annotations

import base64
import http.server
import json
import os
import secrets
import sqlite3
import threading
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import Any

from finp.db import connect, default_db_path
from finp.tink import client as tink_client

LINK_BASE = "https://link.tink.com/1.0/authorize/"

# Fixed port so the redirect URI can be pre-registered in the Tink developer console.
# Register http://localhost:17890/callback there before using the OAuth flow.
OAUTH_CALLBACK_PORT = 17890
OAUTH_REDIRECT_URI = f"http://localhost:{OAUTH_CALLBACK_PORT}/callback"

# In-flight OAuth sessions keyed by state token.
_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()


def authorization_url(client_id: str, redirect_uri: str, state: str, market: str = "FR") -> str:
    """Build the Tink Link authorization URL."""
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "market": market,
        "locale": "fr_FR",
        "scope": "accounts:read,transactions:read,credentials:read",
        "state": state,
    }
    return LINK_BASE + "?" + urllib.parse.urlencode(params)


def _db_path() -> str:
    return os.environ.get("FINP_DB_PATH") or str(default_db_path())


def _extract_user_id(access_token: str) -> str:
    """Extract the ``sub`` claim from a JWT access token."""
    try:
        payload_b64 = access_token.split(".")[1]
        padding = (4 - len(payload_b64) % 4) % 4
        decoded = base64.urlsafe_b64decode(payload_b64 + "=" * padding)
        return json.loads(decoded).get("sub", "default")
    except Exception:
        return "default"


def _store_tokens(conn: sqlite3.Connection, token_data: dict) -> str:
    """Persist token data; returns the tink_user_id used."""
    tink_user_id = token_data.get("tink_user_id") or _extract_user_id(
        token_data["access_token"]
    )
    expires_at = (
        datetime.now(UTC)
        + timedelta(seconds=int(token_data.get("expires_in", 3600)))
    ).isoformat()
    conn.execute(
        """
        INSERT INTO tink_tokens (tink_user_id, access_token, refresh_token, expires_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (tink_user_id) DO UPDATE SET
            access_token  = excluded.access_token,
            refresh_token = excluded.refresh_token,
            expires_at    = excluded.expires_at
        """,
        (tink_user_id, token_data["access_token"], token_data.get("refresh_token", ""), expires_at),
    )
    return tink_user_id


def _success_html() -> bytes:
    return (
        b"<!doctype html><html><head><meta charset=utf-8>"
        b"<title>Finp</title></head>"
        b"<body style='font-family:sans-serif;text-align:center;margin-top:4rem'>"
        b"<h2>Connection successful &#10003;</h2>"
        b"<p>You can close this tab and return to Finp.</p>"
        b"</body></html>"
    )


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    """Handles the single OAuth redirect request then shuts the server down."""

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/callback"):
            self._respond(404, b"not found")
            return

        params = urllib.parse.parse_qs(parsed.query)
        code = (params.get("code") or [None])[0]
        state = (params.get("state") or [None])[0]

        with _sessions_lock:
            session = _sessions.get(state) if state else None

        if session is None or code is None:
            self._respond(400, b"<h1>Invalid callback</h1>")
            self._finish_session(state, error="Invalid callback parameters")
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return

        try:
            token_data = tink_client.exchange_code(
                session["client_id"],
                session["client_secret"],
                code,
                session["redirect_uri"],
            )
            conn = connect(_db_path())
            tink_user_id = _store_tokens(conn, token_data)
            conn.close()
            self._respond(200, _success_html())
            self._finish_session(state, tink_user_id=tink_user_id)
        except Exception as exc:
            self._respond(500, f"<h1>Error</h1><p>{exc}</p>".encode())
            self._finish_session(state, error=str(exc))

        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def _respond(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def _finish_session(
        self,
        state: str | None,
        *,
        tink_user_id: str | None = None,
        error: str | None = None,
    ) -> None:
        if state is None:
            return
        with _sessions_lock:
            if state in _sessions:
                _sessions[state]["done"] = True
                _sessions[state]["tink_user_id"] = tink_user_id
                _sessions[state]["error"] = error

    def log_message(self, *_args: object) -> None:
        pass


def start_oauth_server(client_id: str, client_secret: str) -> tuple[str, str]:
    """Start a local HTTP server on ``OAUTH_CALLBACK_PORT`` and return ``(auth_url, state)``.

    The redirect URI must be pre-registered in the Tink developer console:
    ``http://localhost:17890/callback``

    The server shuts itself down after handling the first callback request.
    """
    state = secrets.token_urlsafe(16)

    with _sessions_lock:
        _sessions[state] = {
            "done": False,
            "tink_user_id": None,
            "error": None,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": OAUTH_REDIRECT_URI,
        }

    server = http.server.HTTPServer(("127.0.0.1", OAUTH_CALLBACK_PORT), _CallbackHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    return authorization_url(client_id, OAUTH_REDIRECT_URI, state), state


def get_oauth_status(state: str) -> dict[str, Any]:
    """Return ``{status, tink_user_id?}`` for the given *state* token."""
    with _sessions_lock:
        session = _sessions.get(state)
    if session is None:
        return {"status": "not_found"}
    if not session["done"]:
        return {"status": "pending"}
    if session["error"]:
        return {"status": "error", "error": session["error"]}
    return {"status": "complete", "tink_user_id": session["tink_user_id"]}


def refresh_token_if_needed(
    conn: sqlite3.Connection, client_id: str, client_secret: str, tink_user_id: str
) -> str:
    """Return a valid access token, refreshing transparently if < 5 min remain."""
    row = conn.execute(
        "SELECT access_token, refresh_token, expires_at FROM tink_tokens WHERE tink_user_id = ?",
        (tink_user_id,),
    ).fetchone()
    if row is None:
        raise ValueError(f"No tokens stored for tink_user_id={tink_user_id!r}")

    expires_at = datetime.fromisoformat(row["expires_at"])
    if expires_at - datetime.now(UTC) > timedelta(minutes=5):
        return row["access_token"]

    token_data = tink_client.refresh_token(client_id, client_secret, row["refresh_token"])
    _store_tokens(conn, {**token_data, "tink_user_id": tink_user_id})
    return token_data["access_token"]
