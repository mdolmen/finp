"""``accounts.*`` commands."""

from __future__ import annotations

import sqlite3
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from finp import accounts
from finp.commands._base import Command, EmptyParams


class AccountOut(BaseModel):
    """Wire shape for an account."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    csv_mapping: dict[str, Any] | None
    created_at: str


class CreateParams(BaseModel):
    name: str = Field(min_length=1)


class IdParams(BaseModel):
    id: int


class RenameParams(BaseModel):
    id: int
    name: str = Field(min_length=1)


class SetCsvMappingParams(BaseModel):
    id: int
    mapping: dict[str, Any] | None


def _list(conn: sqlite3.Connection, _: EmptyParams) -> list[AccountOut]:
    return [AccountOut.model_validate(a) for a in accounts.list_all(conn)]


def _create(conn: sqlite3.Connection, params: CreateParams) -> AccountOut:
    return AccountOut.model_validate(accounts.create(conn, params.name))


def _get(conn: sqlite3.Connection, params: IdParams) -> AccountOut:
    return AccountOut.model_validate(accounts.get(conn, params.id))


def _rename(conn: sqlite3.Connection, params: RenameParams) -> AccountOut:
    return AccountOut.model_validate(accounts.rename(conn, params.id, params.name))


def _set_csv_mapping(conn: sqlite3.Connection, params: SetCsvMappingParams) -> AccountOut:
    return AccountOut.model_validate(accounts.set_csv_mapping(conn, params.id, params.mapping))


def _delete(conn: sqlite3.Connection, params: IdParams) -> None:
    accounts.delete(conn, params.id)


METHODS: dict[str, Command] = {
    "accounts.list": Command(EmptyParams, _list),
    "accounts.get": Command(IdParams, _get),
    "accounts.create": Command(CreateParams, _create),
    "accounts.rename": Command(RenameParams, _rename),
    "accounts.set_csv_mapping": Command(SetCsvMappingParams, _set_csv_mapping),
    "accounts.delete": Command(IdParams, _delete),
}
