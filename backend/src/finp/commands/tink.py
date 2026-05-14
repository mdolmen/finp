"""``tink.*`` commands."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any, Literal

import httpx

log = logging.getLogger(__name__)

from pydantic import BaseModel, Field

from finp.commands._base import Command, EmptyParams
from finp.commands.accounts import AccountOut
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
    from datetime import UTC, datetime, timedelta
    row = conn.execute(
        "SELECT expires_at FROM tink_tokens ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    if row is None:
        return HasConnectionOut(connected=False)
    try:
        expires_at = datetime.fromisoformat(row["expires_at"])
        valid = expires_at - datetime.now(UTC) > timedelta(minutes=5)
    except Exception:
        valid = False
    log.debug("has_connection: expires_at=%r valid=%r", row["expires_at"], valid)
    return HasConnectionOut(connected=valid)


def _get_access_token(conn: sqlite3.Connection) -> str:
    """Return a valid Tink access token, refreshing if needed."""
    token_row = conn.execute(
        "SELECT tink_user_id, expires_at FROM tink_tokens ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    if token_row is None:
        raise AppError("tink.no_tokens", "No Tink connection found. Complete OAuth first.")
    log.debug("_get_access_token: tink_user_id=%r expires_at=%r",
              token_row["tink_user_id"], token_row["expires_at"])
    creds = credentials.get(conn)
    if creds is None:
        raise AppError("tink.no_credentials", "Tink credentials not configured.")
    return tink_auth.refresh_token_if_needed(
        conn, creds["client_id"], creds["client_secret"], token_row["tink_user_id"]
    )


def _list_tink_accounts(conn: sqlite3.Connection, _: EmptyParams) -> list[TinkAccountOut]:
    log.debug("_list_tink_accounts called")
    access_token = _get_access_token(conn)
    try:
        log.debug("calling tink_client.list_accounts")
        raw_accounts = tink_client.list_accounts(access_token)
        log.debug("list_accounts returned %d accounts", len(raw_accounts))
    except httpx.HTTPStatusError as exc:
        log.error("list_accounts HTTP error: status=%d body=%s",
                  exc.response.status_code, exc.response.text[:500])
        if exc.response.status_code == 401:
            raise AppError("tink.reauth_required",
                           f"Tink API 401. Body: {exc.response.text[:200]}") from exc
        raise
    result = []
    for a in raw_accounts:
        iban = None
        identifiers = a.get("identifiers") or {}
        iban_block = identifiers.get("iban") or {}
        if iban_block.get("iban"):
            iban = iban_block["iban"]
        result.append(TinkAccountOut(id=a["id"], name=a["name"], type=a.get("type", ""), iban=iban))
    return result


def _link_account(conn: sqlite3.Connection, params: LinkAccountParams) -> AccountOut:
    updated = conn.execute(
        "UPDATE accounts SET tink_account_id = ? WHERE id = ?",
        (params.tink_account_id, params.finp_account_id),
    ).rowcount
    if updated == 0:
        raise AppError("account.not_found", f"Account {params.finp_account_id} not found.")
    from finp.accounts import get as get_account
    return AccountOut.model_validate(get_account(conn, params.finp_account_id))


class SyncAccountParams(BaseModel):
    account_id: int


class SyncResult(BaseModel):
    imported: int
    skipped: int


def _sync_account(conn: sqlite3.Connection, params: SyncAccountParams) -> SyncResult:
    from finp.tink.sync import sync_account
    result = sync_account(conn, params.account_id)
    return SyncResult(**result)


METHODS: dict[str, Command] = {
    "tink.get_credentials": Command(EmptyParams, _get_credentials),
    "tink.save_credentials": Command(SaveCredentialsParams, _save_credentials),
    "tink.start_oauth": Command(EmptyParams, _start_oauth),
    "tink.get_oauth_status": Command(OAuthStatusParams, _get_oauth_status),
    "tink.has_connection": Command(EmptyParams, _has_connection),
    "tink.list_tink_accounts": Command(EmptyParams, _list_tink_accounts),
    "tink.link_account": Command(LinkAccountParams, _link_account),
    "tink.sync_account": Command(SyncAccountParams, _sync_account),
}
