"""GoCardless token lifecycle + requisition (link) flow.

Token model
-----------
GoCardless tokens are tied to the developer credentials, not to an end user.
A single ``gocardless_tokens`` row holds the latest pair. ``access`` lasts
~24h, ``refresh`` ~30d; when ``refresh`` is also stale, we re-issue both via
``/token/new/`` using the stored ``secret_id``/``secret_key``.

Requisition flow
----------------
1. ``start_requisition_server(institution_id)`` starts a background HTTP
   server on the callback port, calls GoCardless to create a requisition,
   and returns ``(link_url, requisition_id, state)``.
2. The caller opens *link_url* in the user's browser.
3. After bank consent, GoCardless redirects to
   ``http://localhost:{port}/callback?ref={state}``.
4. The background server marks the session complete and shuts down.
5. ``get_requisition_status(state)`` is polled until status != "pending".
"""

from __future__ import annotations

import http.server
import logging
import os
import secrets
import sqlite3
import threading
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import Any

from finp.errors import AppError
from finp.gocardless import client as gc_client
from finp.gocardless.credentials import get as get_credentials

log = logging.getLogger(__name__)

# Default callback port. The redirect URI must be added to the allowlist in
# the GoCardless dashboard before the flow can complete. Overridable via
# ``FINP_GC_PORT`` so deployments that have a port collision can move it.
DEFAULT_CALLBACK_PORT = 17891


def callback_port() -> int:
    """Resolve the loopback port for the requisition redirect."""
    raw = os.environ.get("FINP_GC_PORT")
    if not raw:
        return DEFAULT_CALLBACK_PORT
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_CALLBACK_PORT


def redirect_uri() -> str:
    """Return the full localhost callback URL passed to GoCardless."""
    return f"http://localhost:{callback_port()}/callback"


# In-flight requisition sessions keyed by state token (== requisition reference).
_sessions: dict[str, dict[str, Any]] = {}
_sessions_lock = threading.Lock()


def _store_tokens(conn: sqlite3.Connection, token_data: dict) -> None:
    """Upsert the singleton tokens row.

    ``token_data`` shape after /token/new/ is
    ``{access, refresh, access_expires, refresh_expires}`` (the two ``_expires``
    fields are seconds-until-expiry, not absolute timestamps).
    """
    now = datetime.now(UTC)
    access = token_data["access"]
    access_expires = (now + timedelta(seconds=int(token_data["access_expires"]))).isoformat()
    # /token/refresh/ returns only the access pair; keep the existing refresh.
    if "refresh" in token_data:
        refresh = token_data["refresh"]
        refresh_expires = (now + timedelta(seconds=int(token_data["refresh_expires"]))).isoformat()
        conn.execute(
            """
            INSERT INTO gocardless_tokens (id, access, access_expires, refresh, refresh_expires)
            VALUES (1, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                access          = excluded.access,
                access_expires  = excluded.access_expires,
                refresh         = excluded.refresh,
                refresh_expires = excluded.refresh_expires
            """,
            (access, access_expires, refresh, refresh_expires),
        )
    else:
        conn.execute(
            """
            UPDATE gocardless_tokens
               SET access = ?, access_expires = ?
             WHERE id = 1
            """,
            (access, access_expires),
        )


def access_token_or_refresh(conn: sqlite3.Connection) -> str:
    """Return a valid access token, refreshing or re-issuing transparently.

    Falls back to ``/token/new/`` when the refresh token is also stale.
    """
    creds = get_credentials(conn)
    if creds is None:
        raise AppError("gocardless.no_credentials", "GoCardless credentials not configured.")

    row = conn.execute(
        "SELECT access, access_expires, refresh, refresh_expires FROM gocardless_tokens"
        " WHERE id = 1"
    ).fetchone()
    now = datetime.now(UTC)

    if row is None:
        token_data = gc_client.new_token(creds["secret_id"], creds["secret_key"])
        _store_tokens(conn, token_data)
        return token_data["access"]

    access_expires = datetime.fromisoformat(row["access_expires"])
    if access_expires - now > timedelta(minutes=5):
        return row["access"]

    refresh_expires = datetime.fromisoformat(row["refresh_expires"])
    if refresh_expires - now > timedelta(minutes=5):
        token_data = gc_client.refresh_token(row["refresh"])
        _store_tokens(conn, token_data)
        return token_data["access"]

    token_data = gc_client.new_token(creds["secret_id"], creds["secret_key"])
    _store_tokens(conn, token_data)
    return token_data["access"]


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
    """Catches the single requisition redirect, then shuts the server down."""

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if not parsed.path.startswith("/callback"):
            self._respond(404, b"not found")
            return

        params = urllib.parse.parse_qs(parsed.query)
        ref = (params.get("ref") or [None])[0]
        error = (params.get("error") or [None])[0]

        with _sessions_lock:
            session = _sessions.get(ref) if ref else None

        if session is None:
            self._respond(400, b"<h1>Invalid callback</h1>")
        elif error:
            self._respond(400, f"<h1>Error</h1><p>{error}</p>".encode())
            self._finish_session(ref, error=error)
        else:
            self._respond(200, _success_html())
            self._finish_session(ref)

        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def _respond(self, status: int, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(body)

    def _finish_session(self, state: str, *, error: str | None = None) -> None:
        with _sessions_lock:
            if state in _sessions:
                _sessions[state]["done"] = True
                _sessions[state]["error"] = error

    def log_message(self, *_args: object) -> None:
        pass


def start_requisition(conn: sqlite3.Connection, institution_id: str) -> tuple[str, str, str]:
    """Create a requisition with GoCardless and start the callback server.

    Returns ``(link_url, requisition_id, state)``. The caller opens *link_url*
    in the user's browser; after bank auth the local server catches the
    redirect, and ``get_requisition_status(state)`` flips to ``complete``.
    """
    access_token = access_token_or_refresh(conn)
    state = secrets.token_urlsafe(16)

    requisition = gc_client.create_requisition(
        access_token,
        institution_id=institution_id,
        redirect=redirect_uri(),
        reference=state,
    )

    with _sessions_lock:
        _sessions[state] = {
            "done": False,
            "error": None,
            "requisition_id": requisition["id"],
        }

    server = http.server.HTTPServer(("127.0.0.1", callback_port()), _CallbackHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    return requisition["link"], requisition["id"], state


def get_requisition_status(state: str) -> dict[str, Any]:
    """Return ``{status, requisition_id?, error?}`` for the given state token."""
    with _sessions_lock:
        session = _sessions.get(state)
    if session is None:
        return {"status": "not_found"}
    if not session["done"]:
        return {"status": "pending"}
    if session["error"]:
        return {"status": "error", "error": session["error"]}
    return {"status": "complete", "requisition_id": session["requisition_id"]}
