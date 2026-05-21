"""Pending-validation queue: enqueue matches, confirm/refuse, expose history."""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from finp.automations.crud import Automation
from finp.automations.matcher import match, operation_id_from_payload
from finp.automations.webhook import post_webhook

Status = Literal["pending", "sent", "failed", "refused"]


class PendingNotFoundError(LookupError):
    """Raised when a pending row id has no row, or has already been resolved."""


@dataclass(frozen=True, slots=True)
class PendingItem:
    """A single match awaiting (or having received) human resolution."""

    id: int
    automation_id: int
    automation_name: str
    callback_url: str
    event_type: str
    operation_id: int | None
    payload: dict[str, Any]
    status: Status
    error: str | None
    created_at: str
    resolved_at: str | None


def _row_to_item(row: sqlite3.Row) -> PendingItem:
    return PendingItem(
        id=row["id"],
        automation_id=row["automation_id"],
        automation_name=row["automation_name"],
        callback_url=row["callback_url"],
        event_type=row["event_type"],
        operation_id=row["operation_id"],
        payload=json.loads(row["event_payload_json"]),
        status=row["status"],
        error=row["error"],
        created_at=row["created_at"],
        resolved_at=row["resolved_at"],
    )


_SELECT = (
    "SELECT p.id, p.automation_id, a.name AS automation_name, a.callback_url,"
    " p.event_type, p.operation_id, p.event_payload_json, p.status, p.error,"
    " p.created_at, p.resolved_at"
    " FROM automation_pending p JOIN automations a ON a.id = p.automation_id"
)


def _enqueue_one(
    conn: sqlite3.Connection,
    automation: Automation,
    event_type: str,
    payload: Mapping[str, Any],
) -> int | None:
    """Insert one pending row. Returns the new id, or ``None`` on dedup conflict."""
    cur = conn.execute(
        "INSERT INTO automation_pending"
        "(automation_id, operation_id, event_type, event_payload_json)"
        " VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        (
            automation.id,
            operation_id_from_payload(payload),
            event_type,
            json.dumps(payload, separators=(",", ":")),
        ),
    )
    if cur.rowcount == 0:
        return None
    return cur.lastrowid


def enqueue_for_event(
    conn: sqlite3.Connection, event_type: str, payload: Mapping[str, Any]
) -> list[int]:
    """Match and enqueue. Returns the ids of newly-inserted pending rows."""
    inserted: list[int] = []
    for automation in match(conn, event_type, payload):
        new_id = _enqueue_one(conn, automation, event_type, payload)
        if new_id is not None:
            inserted.append(new_id)
    return inserted


def list_pending(conn: sqlite3.Connection) -> list[PendingItem]:
    """Return every row still awaiting human action, newest first."""
    rows = conn.execute(
        _SELECT + " WHERE p.status = 'pending' ORDER BY p.created_at DESC, p.id DESC"
    ).fetchall()
    return [_row_to_item(r) for r in rows]


def list_history(
    conn: sqlite3.Connection,
    *,
    status: Literal["sent", "failed", "refused", "all"] = "all",
    limit: int = 20,
) -> list[PendingItem]:
    """Return resolved rows, most-recent-first, optionally filtered by status."""
    sql = _SELECT + " WHERE p.status != 'pending'"
    params: list[object] = []
    if status != "all":
        sql += " AND p.status = ?"
        params.append(status)
    sql += " ORDER BY p.resolved_at DESC, p.id DESC LIMIT ?"
    params.append(limit)
    rows = conn.execute(sql, params).fetchall()
    return [_row_to_item(r) for r in rows]


def _get_for_confirm(conn: sqlite3.Connection, pending_id: int) -> PendingItem:
    row = conn.execute(_SELECT + " WHERE p.id = ?", (pending_id,)).fetchone()
    if row is None:
        raise PendingNotFoundError(f"pending id={pending_id}")
    return _row_to_item(row)


def confirm(conn: sqlite3.Connection, pending_id: int) -> PendingItem:
    """Fire the webhook for ``pending_id``. Updates status to ``sent`` or ``failed``.

    Re-confirming a ``failed`` row retries; calling on ``sent`` or ``refused``
    is a no-op (returns the row as-is) so the UI's retry button stays safe.
    """
    item = _get_for_confirm(conn, pending_id)
    if item.status in ("sent", "refused"):
        return item

    error = post_webhook(item.callback_url, _build_webhook_body(item))
    new_status: Status = "failed" if error is not None else "sent"
    conn.execute(
        "UPDATE automation_pending"
        " SET status = ?, error = ?,"
        " resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
        " WHERE id = ?",
        (new_status, error, pending_id),
    )
    return _get_for_confirm(conn, pending_id)


def refuse(conn: sqlite3.Connection, pending_id: int) -> PendingItem:
    """Mark a pending row as ``refused`` so it stays in history but won't fire."""
    item = _get_for_confirm(conn, pending_id)
    if item.status != "pending":
        return item
    conn.execute(
        "UPDATE automation_pending"
        " SET status = 'refused', error = NULL,"
        " resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
        " WHERE id = ?",
        (pending_id,),
    )
    return _get_for_confirm(conn, pending_id)


def _build_webhook_body(item: PendingItem) -> dict[str, Any]:
    """Shape of the POSTed JSON body. Documented in NOTES.md."""
    return {
        "automation": {"id": item.automation_id, "name": item.automation_name},
        "event": {"type": item.event_type, "payload": item.payload},
        "pending_id": item.id,
        "confirmed_at": None,  # webhook delivery is what "confirms" it
    }
