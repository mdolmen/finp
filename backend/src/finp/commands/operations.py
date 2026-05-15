"""``operations.*`` commands."""

from __future__ import annotations

import sqlite3
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from finp import operations
from finp.commands._base import Command


class OperationOut(BaseModel):
    """Wire shape for an operation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    account_id: int
    date: str
    montant_cents: int
    libelle: str
    type: str
    category_id: int | None
    dedup_hash: str
    created_at: str
    is_recurring: bool = False


class IdParams(BaseModel):
    id: int


class InsertParams(BaseModel):
    account_id: int
    date: str = Field(min_length=1)
    montant_cents: int
    libelle: str = Field(min_length=1)


class AssignCategoryParams(BaseModel):
    id: int
    category_id: int | None


class BulkAssignCategoryParams(BaseModel):
    ids: list[int]
    category_id: int | None


class BulkAssignResult(BaseModel):
    updated: int


class SetRecurringParams(BaseModel):
    id: int
    is_recurring: bool


class ListParams(BaseModel):
    account_ids: list[int] | None = None
    category_ids: list[int] | None = None
    include_no_category: bool = False
    types: list[str] | None = None
    date_from: str | None = None
    date_to: str | None = None
    search: str | None = None
    montant_op: Literal[">", "<", "=="] | None = None
    montant_value_cents: int | None = None
    recurring_only: bool = False
    limit: int | None = None
    offset: int = 0


def _get(conn: sqlite3.Connection, params: IdParams) -> OperationOut:
    return OperationOut.model_validate(operations.get(conn, params.id))


def _insert(conn: sqlite3.Connection, params: InsertParams) -> OperationOut | None:
    op = operations.insert(
        conn,
        account_id=params.account_id,
        date=params.date,
        montant_cents=params.montant_cents,
        libelle=params.libelle,
    )
    return OperationOut.model_validate(op) if op is not None else None


def _set_recurring(conn: sqlite3.Connection, params: SetRecurringParams) -> OperationOut:
    return OperationOut.model_validate(
        operations.set_recurring(conn, params.id, params.is_recurring)
    )


def _assign_category(conn: sqlite3.Connection, params: AssignCategoryParams) -> OperationOut:
    return OperationOut.model_validate(
        operations.assign_category(conn, params.id, params.category_id)
    )


def _bulk_assign_category(
    conn: sqlite3.Connection, params: BulkAssignCategoryParams
) -> BulkAssignResult:
    for op_id in params.ids:
        operations.assign_category(conn, op_id, params.category_id)
    return BulkAssignResult(updated=len(params.ids))


def _list(conn: sqlite3.Connection, params: ListParams) -> list[OperationOut]:
    rows = operations.list_(
        conn,
        account_ids=params.account_ids,
        category_ids=params.category_ids,
        include_no_category=params.include_no_category,
        montant_op=params.montant_op,
        montant_value_cents=params.montant_value_cents,
        types=params.types,
        date_from=params.date_from,
        date_to=params.date_to,
        search=params.search,
        recurring_only=params.recurring_only,
        limit=params.limit,
        offset=params.offset,
    )
    return [OperationOut.model_validate(o) for o in rows]


METHODS: dict[str, Command] = {
    "operations.get": Command(IdParams, _get),
    "operations.list": Command(ListParams, _list),
    "operations.insert": Command(InsertParams, _insert),
    "operations.set_recurring": Command(SetRecurringParams, _set_recurring),
    "operations.assign_category": Command(AssignCategoryParams, _assign_category),
    "operations.bulk_assign_category": Command(BulkAssignCategoryParams, _bulk_assign_category),
}
