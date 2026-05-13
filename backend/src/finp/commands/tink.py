"""``tink.*`` commands."""

from __future__ import annotations

import sqlite3
from typing import Literal

from pydantic import BaseModel, Field

from finp.commands._base import Command, EmptyParams
from finp.tink import credentials


class CredentialsOut(BaseModel):
    client_id: str
    client_secret: str
    environment: Literal["sandbox", "production"]


class SaveCredentialsParams(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    environment: Literal["sandbox", "production"]


def _get_credentials(conn: sqlite3.Connection, _: EmptyParams) -> CredentialsOut | None:
    row = credentials.get(conn)
    if row is None:
        return None
    return CredentialsOut(**row)


def _save_credentials(conn: sqlite3.Connection, params: SaveCredentialsParams) -> CredentialsOut:
    credentials.save(conn, params.client_id, params.client_secret, params.environment)
    return CredentialsOut(
        client_id=params.client_id,
        client_secret=params.client_secret,
        environment=params.environment,
    )


METHODS: dict[str, Command] = {
    "tink.get_credentials": Command(EmptyParams, _get_credentials),
    "tink.save_credentials": Command(SaveCredentialsParams, _save_credentials),
}
