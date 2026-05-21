"""Subscribe the automation queue to the global event bus.

Called once at startup. For every supported event, look up matching
automations and enqueue them as pending validations.
"""

from __future__ import annotations

import logging
import sqlite3
from collections.abc import Callable
from typing import Any

from finp import events
from finp.automations.crud import SUPPORTED_EVENT_TYPES
from finp.automations.queue import enqueue_for_event

_logger = logging.getLogger(__name__)

# Hook fired after rows are enqueued, for the IPC layer to forward to the UI.
# Receives the list of newly-inserted pending ids. May be ``None``.
OnEnqueue = Callable[[list[int]], None]


def install(conn: sqlite3.Connection, on_enqueue: OnEnqueue | None = None) -> None:
    """Wire one subscriber per supported event type on the global bus."""

    def handler_for(event_type: str) -> events.Handler:
        def handle(payload: dict[str, Any]) -> None:
            try:
                inserted = enqueue_for_event(conn, event_type, payload)
            except Exception:
                _logger.exception("automation enqueue failed for %s", event_type)
                return
            if inserted and on_enqueue is not None:
                on_enqueue(inserted)

        return handle

    for event_type in SUPPORTED_EVENT_TYPES:
        events.bus.subscribe(event_type, handler_for(event_type))
