"""CRUD over the ``automations`` table."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from finp import predicates
from finp.predicates import Predicate

# Events whose payload carries an operation id, so the predicate has something
# to match against. Other event types are not supported in v1.
SUPPORTED_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "operation.created",
        "operation.updated",
        "operation.category_assigned",
        "rule.matched",
    }
)


class AutomationNotFoundError(LookupError):
    """Raised when an automation id has no row in the database."""


@dataclass(frozen=True, slots=True)
class Automation:
    """A predicate + event type + callback URL, gated by human validation."""

    id: int
    name: str
    event_type: str
    predicate: Predicate
    callback_url: str
    enabled: bool
    created_at: str


def _row_to_automation(row: sqlite3.Row) -> Automation:
    return Automation(
        id=row["id"],
        name=row["name"],
        event_type=row["event_type"],
        predicate=predicates.from_dict(json.loads(row["predicate_json"])),
        callback_url=row["callback_url"],
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
    )


def _validate_event_type(event_type: str) -> None:
    if event_type not in SUPPORTED_EVENT_TYPES:
        raise ValueError(
            f"unsupported event_type: {event_type!r}. Supported: {sorted(SUPPORTED_EVENT_TYPES)}"
        )


def create(
    conn: sqlite3.Connection,
    *,
    name: str,
    event_type: str,
    predicate: Predicate,
    callback_url: str,
    enabled: bool = True,
) -> Automation:
    """Create an automation. ``event_type`` must be one of ``SUPPORTED_EVENT_TYPES``."""
    _validate_event_type(event_type)
    cur = conn.execute(
        "INSERT INTO automations(name, event_type, predicate_json, callback_url, enabled)"
        " VALUES (?, ?, ?, ?, ?)",
        (
            name,
            event_type,
            json.dumps(predicate.to_dict()),
            callback_url,
            int(enabled),
        ),
    )
    assert cur.lastrowid is not None
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, automation_id: int) -> Automation:
    """Fetch an automation by id. Raises ``AutomationNotFoundError`` if missing."""
    row = conn.execute(
        "SELECT id, name, event_type, predicate_json, callback_url, enabled, created_at"
        " FROM automations WHERE id = ?",
        (automation_id,),
    ).fetchone()
    if row is None:
        raise AutomationNotFoundError(f"automation id={automation_id}")
    return _row_to_automation(row)


def list_all(conn: sqlite3.Connection) -> list[Automation]:
    """List automations ordered by name then id."""
    rows = conn.execute(
        "SELECT id, name, event_type, predicate_json, callback_url, enabled, created_at"
        " FROM automations ORDER BY name COLLATE NOCASE, id"
    ).fetchall()
    return [_row_to_automation(r) for r in rows]


def update(
    conn: sqlite3.Connection,
    automation_id: int,
    *,
    name: str | None = None,
    event_type: str | None = None,
    predicate: Predicate | None = None,
    callback_url: str | None = None,
    enabled: bool | None = None,
) -> Automation:
    """Partial update. Pass only the fields to change."""
    get(conn, automation_id)
    sets: list[str] = []
    params: list[object] = []
    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if event_type is not None:
        _validate_event_type(event_type)
        sets.append("event_type = ?")
        params.append(event_type)
    if predicate is not None:
        sets.append("predicate_json = ?")
        params.append(json.dumps(predicate.to_dict()))
    if callback_url is not None:
        sets.append("callback_url = ?")
        params.append(callback_url)
    if enabled is not None:
        sets.append("enabled = ?")
        params.append(int(enabled))
    if sets:
        params.append(automation_id)
        conn.execute(f"UPDATE automations SET {', '.join(sets)} WHERE id = ?", params)
    return get(conn, automation_id)


def toggle(conn: sqlite3.Connection, automation_id: int, enabled: bool) -> Automation:
    """Flip the ``enabled`` flag."""
    return update(conn, automation_id, enabled=enabled)


def delete(conn: sqlite3.Connection, automation_id: int) -> None:
    """Delete an automation. Cascades to its pending rows via FK."""
    cur = conn.execute("DELETE FROM automations WHERE id = ?", (automation_id,))
    if cur.rowcount == 0:
        raise AutomationNotFoundError(f"automation id={automation_id}")
