"""Match published events against enabled automations.

V1 supports only events carrying an operation id (see
``SUPPORTED_EVENT_TYPES`` in ``crud``). The matcher loads the referenced
operation, evaluates each automation's predicate, and returns the list of
matches.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from typing import Any

from finp import operations
from finp.automations.crud import Automation, list_all


def operation_id_from_payload(payload: Mapping[str, Any]) -> int | None:
    """Extract the operation id from an event payload.

    Operation events use ``id``; ``rule.matched`` uses ``operation_id``.
    """
    for key in ("id", "operation_id"):
        value = payload.get(key)
        if isinstance(value, int):
            return value
    return None


def match(
    conn: sqlite3.Connection, event_type: str, payload: Mapping[str, Any]
) -> list[Automation]:
    """Return enabled automations whose event type + predicate matches.

    Returns an empty list if the payload has no resolvable operation.
    """
    op_id = operation_id_from_payload(payload)
    if op_id is None:
        return []
    try:
        op = operations.get(conn, op_id)
    except LookupError:
        return []

    matches: list[Automation] = []
    for automation in list_all(conn):
        if not automation.enabled:
            continue
        if automation.event_type != event_type:
            continue
        if automation.predicate.matches(op):
            matches.append(automation)
    return matches
