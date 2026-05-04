"""``categories.*`` commands."""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel, ConfigDict, Field

from finp import categories
from finp.commands._base import Command, EmptyParams


class CategoryOut(BaseModel):
    """Wire shape for a category."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_builtin: bool
    display_order: int


class CreateParams(BaseModel):
    name: str = Field(min_length=1)


class IdParams(BaseModel):
    id: int


class RenameParams(BaseModel):
    id: int
    name: str = Field(min_length=1)


class ReassignParams(BaseModel):
    from_id: int
    to_id: int | None


class ReassignResult(BaseModel):
    moved: int


def _list(conn: sqlite3.Connection, _: EmptyParams) -> list[CategoryOut]:
    return [CategoryOut.model_validate(c) for c in categories.list_all(conn)]


def _create(conn: sqlite3.Connection, params: CreateParams) -> CategoryOut:
    return CategoryOut.model_validate(categories.create(conn, params.name))


def _rename(conn: sqlite3.Connection, params: RenameParams) -> CategoryOut:
    return CategoryOut.model_validate(categories.rename(conn, params.id, params.name))


def _delete(conn: sqlite3.Connection, params: IdParams) -> None:
    categories.delete(conn, params.id)


def _reassign(conn: sqlite3.Connection, params: ReassignParams) -> ReassignResult:
    moved = categories.reassign_operations(conn, params.from_id, params.to_id)
    return ReassignResult(moved=moved)


METHODS: dict[str, Command] = {
    "categories.list": Command(EmptyParams, _list),
    "categories.create": Command(CreateParams, _create),
    "categories.rename": Command(RenameParams, _rename),
    "categories.delete": Command(IdParams, _delete),
    "categories.reassign_operations": Command(ReassignParams, _reassign),
}
