"""In-process event bus.

A single extension seam for side-effectful integrations (future
``Automatisations`` page, n8n bridges, etc.). Domain code calls
``publish``; integrations call ``subscribe``. With no subscribers,
publishing is effectively free.

Event names use a dotted convention: ``<resource>.<verb>``.
"""

from __future__ import annotations

import contextlib
import logging
from collections import defaultdict
from collections.abc import Callable
from typing import Any, Final

_logger = logging.getLogger(__name__)

OPERATION_CREATED: Final = "operation.created"
OPERATION_UPDATED: Final = "operation.updated"
OPERATION_CATEGORY_ASSIGNED: Final = "operation.category_assigned"
RULE_MATCHED: Final = "rule.matched"

Payload = dict[str, Any]
Handler = Callable[[Payload], None]


class EventBus:
    """Tiny synchronous pub/sub. One handler list per event name."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event: str, handler: Handler) -> Callable[[], None]:
        """Register ``handler`` for ``event``. Returns an unsubscribe function."""
        self._handlers[event].append(handler)

        def unsubscribe() -> None:
            with contextlib.suppress(ValueError):
                self._handlers[event].remove(handler)

        return unsubscribe

    def publish(self, event: str, payload: Payload) -> None:
        """Dispatch ``payload`` to every subscriber of ``event``.

        Handler exceptions are swallowed (logged via ``stderr``) so one
        misbehaving subscriber can't break unrelated ones or the caller.
        """
        _logger.debug("event %s %s", event, payload)
        for handler in list(self._handlers.get(event, ())):
            try:
                handler(payload)
            except Exception as exc:
                import sys

                print(
                    f"event handler for {event!r} raised {type(exc).__name__}: {exc}",
                    file=sys.stderr,
                )

    def clear(self) -> None:
        """Remove all subscribers. Intended for tests."""
        self._handlers.clear()


bus = EventBus()
