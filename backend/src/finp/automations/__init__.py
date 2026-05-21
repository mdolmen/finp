"""Automations: human-validated outbound webhooks over the event bus.

Public surface re-exports the subset most callers need; sub-modules carry
the implementation.
"""

from finp.automations.crud import (
    Automation,
    AutomationNotFoundError,
    create,
    delete,
    get,
    list_all,
    toggle,
    update,
)
from finp.automations.matcher import match
from finp.automations.queue import (
    PendingItem,
    PendingNotFoundError,
    confirm,
    enqueue_for_event,
    list_history,
    list_pending,
    refuse,
)
from finp.automations.subscriber import install as install_subscriber

__all__ = [
    "Automation",
    "AutomationNotFoundError",
    "PendingItem",
    "PendingNotFoundError",
    "confirm",
    "create",
    "delete",
    "enqueue_for_event",
    "get",
    "install_subscriber",
    "list_all",
    "list_history",
    "list_pending",
    "match",
    "refuse",
    "toggle",
    "update",
]
