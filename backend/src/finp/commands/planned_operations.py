"""``planned.*`` commands."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel, ConfigDict, Field

from finp import planned_operations as planned
from finp.commands._base import Command, EmptyParams


class PlannedOperationOut(BaseModel):
    """Wire shape for a planned operation."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    date: str
    montant_cents: int
    libelle: str
    created_at: str


class IdParams(BaseModel):
    id: int


class CreateParams(BaseModel):
    date: str = Field(min_length=1)
    montant_cents: int
    libelle: str = Field(min_length=1)


def _list(conn: sqlite3.Connection, _: EmptyParams) -> list[PlannedOperationOut]:
    return [PlannedOperationOut.model_validate(p) for p in planned.list_all(conn)]


def _create(conn: sqlite3.Connection, params: CreateParams) -> PlannedOperationOut:
    op = planned.create(
        conn,
        date=params.date,
        montant_cents=params.montant_cents,
        libelle=params.libelle,
    )
    return PlannedOperationOut.model_validate(op)


def _delete(conn: sqlite3.Connection, params: IdParams) -> None:
    planned.delete(conn, params.id)


METHODS: dict[str, Command] = {
    "planned.list": Command(EmptyParams, _list),
    "planned.create": Command(CreateParams, _create),
    "planned.delete": Command(IdParams, _delete),
}
