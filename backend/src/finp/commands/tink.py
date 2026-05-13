"""``tink.*`` commands."""

from __future__ import annotations

import sqlite3
from typing import Any, Literal

from pydantic import BaseModel, Field

from finp.accounts import Account
from finp.commands._base import Command, EmptyParams
from finp.errors import AppError
from finp.tink import auth as tink_auth
from finp.tink import client as tink_client
from finp.tink import credentials


class CredentialsOut(BaseModel):
    client_id: str
    client_secret: str
    environment: Literal["sandbox", "production"]


class SaveCredentialsParams(BaseModel):
    client_id: str = Field(min_length=1)
    client_secret: str = Field(min_length=1)
    environment: Literal["sandbox", "production"]


class StartOAuthOut(BaseModel):
    auth_url: str
    state: str


class OAuthStatusParams(BaseModel):
    state: str


class OAuthStatusOut(BaseModel):
    status: str
    tink_user_id: str | None = None
    error: str | None = None


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


def _start_oauth(conn: sqlite3.Connection, _: EmptyParams) -> StartOAuthOut:
    row = credentials.get(conn)
    if row is None:
        raise AppError("tink.no_credentials", "Tink credentials not configured.")
    auth_url, state = tink_auth.start_oauth_server(row["client_id"], row["client_secret"])
    return StartOAuthOut(auth_url=auth_url, state=state)


def _get_oauth_status(_conn: sqlite3.Connection, params: OAuthStatusParams) -> OAuthStatusOut:
    result: dict[str, Any] = tink_auth.get_oauth_status(params.state)
    return OAuthStatusOut(**result)


class HasConnectionOut(BaseModel):
    connected: bool


class TinkAccountOut(BaseModel):
    id: str
    name: str
    type: str
    iban: str | None = None


class LinkAccountParams(BaseModel):
    finp_account_id: int
    tink_account_id: str


def _has_connection(conn: sqlite3.Connection, _: EmptyParams) -> HasConnectionOut:
    count = conn.execute("SELECT COUNT(*) FROM tink_tokens").fetchone()[0]
    return HasConnectionOut(connected=count > 0)


def _list_tink_accounts(conn: sqlite3.Connection, _: EmptyParams) -> list[TinkAccountOut]:
    row = conn.execute(
        "SELECT access_token FROM tink_tokens ORDER BY rowid LIMIT 1"
    ).fetchone()
    if row is None:
        raise AppError("tink.no_tokens", "No Tink connection found. Complete OAuth first.")
    raw_accounts = tink_client.list_accounts(row["access_token"])
    result = []
    for a in raw_accounts:
        iban = None
        identifiers = a.get("identifiers") or {}
        iban_block = identifiers.get("iban") or {}
        if iban_block.get("iban"):
            iban = iban_block["iban"]
        result.append(TinkAccountOut(id=a["id"], name=a["name"], type=a.get("type", ""), iban=iban))
    return result


def _link_account(conn: sqlite3.Connection, params: LinkAccountParams) -> Account:
    updated = conn.execute(
        "UPDATE accounts SET tink_account_id = ? WHERE id = ?",
        (params.tink_account_id, params.finp_account_id),
    ).rowcount
    if updated == 0:
        raise AppError("account.not_found", f"Account {params.finp_account_id} not found.")
    from finp.accounts import get as get_account
    return get_account(conn, params.finp_account_id)


METHODS: dict[str, Command] = {
    "tink.get_credentials": Command(EmptyParams, _get_credentials),
    "tink.save_credentials": Command(SaveCredentialsParams, _save_credentials),
    "tink.start_oauth": Command(EmptyParams, _start_oauth),
    "tink.get_oauth_status": Command(OAuthStatusParams, _get_oauth_status),
    "tink.has_connection": Command(EmptyParams, _has_connection),
    "tink.list_tink_accounts": Command(EmptyParams, _list_tink_accounts),
    "tink.link_account": Command(LinkAccountParams, _link_account),
}
