"""``automations.*`` commands: CRUD plus pending queue + history."""

from __future__ import annotations

import sqlite3
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from finp import automations, predicates
from finp.automations.crud import Automation
from finp.automations.queue import PendingItem
from finp.commands._base import Command, EmptyParams
from finp.commands.rules import PredicateIn, _model_to_predicate


class AutomationOut(BaseModel):
    """Wire shape for an automation. ``predicate`` is the registry's dict form."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    event_type: str
    predicate: dict[str, Any]
    callback_url: str
    enabled: bool
    created_at: str

    @classmethod
    def from_automation(cls, a: Automation) -> AutomationOut:
        return cls(
            id=a.id,
            name=a.name,
            event_type=a.event_type,
            predicate=a.predicate.to_dict(),
            callback_url=a.callback_url,
            enabled=a.enabled,
            created_at=a.created_at,
        )


class PendingOut(BaseModel):
    """Wire shape for a pending (or resolved) automation match."""

    id: int
    automation_id: int
    automation_name: str
    callback_url: str
    event_type: str
    operation_id: int | None
    payload: dict[str, Any]
    status: Literal["pending", "sent", "failed", "refused"]
    error: str | None
    created_at: str
    resolved_at: str | None

    @classmethod
    def from_item(cls, item: PendingItem) -> PendingOut:
        return cls(
            id=item.id,
            automation_id=item.automation_id,
            automation_name=item.automation_name,
            callback_url=item.callback_url,
            event_type=item.event_type,
            operation_id=item.operation_id,
            payload=item.payload,
            status=item.status,
            error=item.error,
            created_at=item.created_at,
            resolved_at=item.resolved_at,
        )


class IdParams(BaseModel):
    id: int


_SUPPORTED_EVENT_TYPES = Literal[
    "operation.created",
    "operation.updated",
    "operation.category_assigned",
    "rule.matched",
]


class CreateParams(BaseModel):
    name: str = Field(min_length=1)
    event_type: _SUPPORTED_EVENT_TYPES
    predicate: PredicateIn
    callback_url: HttpUrl
    enabled: bool = True


class UpdateParams(BaseModel):
    id: int
    name: str | None = Field(default=None, min_length=1)
    event_type: _SUPPORTED_EVENT_TYPES | None = None
    predicate: PredicateIn | None = None
    callback_url: HttpUrl | None = None
    enabled: bool | None = None


class ToggleParams(BaseModel):
    id: int
    enabled: bool


class HistoryParams(BaseModel):
    status: Literal["sent", "failed", "refused", "all"] = "all"
    limit: int = Field(default=20, ge=1, le=200)


def _list(conn: sqlite3.Connection, _: EmptyParams) -> list[AutomationOut]:
    return [AutomationOut.from_automation(a) for a in automations.list_all(conn)]


def _create(conn: sqlite3.Connection, params: CreateParams) -> AutomationOut:
    a = automations.create(
        conn,
        name=params.name,
        event_type=params.event_type,
        predicate=_model_to_predicate(params.predicate),
        callback_url=str(params.callback_url),
        enabled=params.enabled,
    )
    return AutomationOut.from_automation(a)


def _update(conn: sqlite3.Connection, params: UpdateParams) -> AutomationOut:
    predicate: predicates.Predicate | None = (
        _model_to_predicate(params.predicate) if params.predicate is not None else None
    )
    a = automations.update(
        conn,
        params.id,
        name=params.name,
        event_type=params.event_type,
        predicate=predicate,
        callback_url=str(params.callback_url) if params.callback_url is not None else None,
        enabled=params.enabled,
    )
    return AutomationOut.from_automation(a)


def _toggle(conn: sqlite3.Connection, params: ToggleParams) -> AutomationOut:
    return AutomationOut.from_automation(automations.toggle(conn, params.id, params.enabled))


def _delete(conn: sqlite3.Connection, params: IdParams) -> None:
    automations.delete(conn, params.id)


def _pending_list(conn: sqlite3.Connection, _: EmptyParams) -> list[PendingOut]:
    return [PendingOut.from_item(i) for i in automations.list_pending(conn)]


def _pending_confirm(conn: sqlite3.Connection, params: IdParams) -> PendingOut:
    return PendingOut.from_item(automations.confirm(conn, params.id))


def _pending_refuse(conn: sqlite3.Connection, params: IdParams) -> PendingOut:
    return PendingOut.from_item(automations.refuse(conn, params.id))


def _history_list(conn: sqlite3.Connection, params: HistoryParams) -> list[PendingOut]:
    return [
        PendingOut.from_item(i)
        for i in automations.list_history(conn, status=params.status, limit=params.limit)
    ]


METHODS: dict[str, Command] = {
    "automations.list": Command(EmptyParams, _list),
    "automations.create": Command(CreateParams, _create),
    "automations.update": Command(UpdateParams, _update),
    "automations.toggle": Command(ToggleParams, _toggle),
    "automations.delete": Command(IdParams, _delete),
    "automations.pending.list": Command(EmptyParams, _pending_list),
    "automations.pending.confirm": Command(IdParams, _pending_confirm),
    "automations.pending.refuse": Command(IdParams, _pending_refuse),
    "automations.history.list": Command(HistoryParams, _history_list),
}
