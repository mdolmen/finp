"""``gocardless.*`` commands."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

import httpx
from pydantic import BaseModel, Field

from finp.commands._base import Command, EmptyParams
from finp.commands.accounts import AccountOut
from finp.errors import AppError
from finp.gocardless import auth, client, credentials

log = logging.getLogger(__name__)


class CredentialsOut(BaseModel):
    secret_id: str
    secret_key: str


class SaveCredentialsParams(BaseModel):
    secret_id: str = Field(min_length=1)
    secret_key: str = Field(min_length=1)


class HasConnectionOut(BaseModel):
    connected: bool


class InstitutionOut(BaseModel):
    id: str
    name: str
    bic: str | None = None
    logo: str | None = None


class CreateRequisitionParams(BaseModel):
    institution_id: str = Field(min_length=1)


class CreateRequisitionOut(BaseModel):
    link: str
    requisition_id: str
    state: str
    redirect_uri: str


class RequisitionStatusParams(BaseModel):
    state: str


class RequisitionStatusOut(BaseModel):
    status: str
    requisition_id: str | None = None
    error: str | None = None


class ListRequisitionAccountsParams(BaseModel):
    requisition_id: str


class GcAccountOut(BaseModel):
    id: str
    iban: str | None = None
    owner_name: str | None = None
    institution_name: str | None = None


class LinkAccountParams(BaseModel):
    finp_account_id: int
    gocardless_account_id: str
    requisition_id: str


class SyncAccountParams(BaseModel):
    account_id: int


class SyncResult(BaseModel):
    imported: int
    skipped: int


def _get_credentials(conn: sqlite3.Connection, _: EmptyParams) -> CredentialsOut | None:
    row = credentials.get(conn)
    if row is None:
        return None
    return CredentialsOut(**row)


def _save_credentials(conn: sqlite3.Connection, params: SaveCredentialsParams) -> CredentialsOut:
    credentials.save(conn, params.secret_id, params.secret_key)
    return CredentialsOut(secret_id=params.secret_id, secret_key=params.secret_key)


def _has_connection(conn: sqlite3.Connection, _: EmptyParams) -> HasConnectionOut:
    row = conn.execute("SELECT 1 FROM gocardless_tokens WHERE id = 1").fetchone()
    return HasConnectionOut(connected=row is not None)


def _list_institutions(conn: sqlite3.Connection, _: EmptyParams) -> list[InstitutionOut]:
    access_token = auth.access_token_or_refresh(conn)
    try:
        raw = client.list_institutions(access_token, country="fr")
    except httpx.HTTPStatusError as exc:
        raise AppError(
            "gocardless.institutions_failed",
            f"Could not fetch institutions ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    return [
        InstitutionOut(
            id=item["id"],
            name=item["name"],
            bic=item.get("bic"),
            logo=item.get("logo"),
        )
        for item in raw
    ]


def _create_requisition(
    conn: sqlite3.Connection, params: CreateRequisitionParams
) -> CreateRequisitionOut:
    try:
        link, requisition_id, state = auth.start_requisition(conn, params.institution_id)
    except httpx.HTTPStatusError as exc:
        raise AppError(
            "gocardless.requisition_failed",
            f"Could not create requisition ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    return CreateRequisitionOut(
        link=link,
        requisition_id=requisition_id,
        state=state,
        redirect_uri=auth.redirect_uri(),
    )


def _get_requisition_status(
    _conn: sqlite3.Connection, params: RequisitionStatusParams
) -> RequisitionStatusOut:
    result: dict[str, Any] = auth.get_requisition_status(params.state)
    return RequisitionStatusOut(**result)


def _list_requisition_accounts(
    conn: sqlite3.Connection, params: ListRequisitionAccountsParams
) -> list[GcAccountOut]:
    access_token = auth.access_token_or_refresh(conn)
    try:
        requisition = client.get_requisition(access_token, params.requisition_id)
    except httpx.HTTPStatusError as exc:
        raise AppError(
            "gocardless.requisition_fetch_failed",
            f"Could not load requisition ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    account_ids: list[str] = requisition.get("accounts") or []
    out: list[GcAccountOut] = []
    for gc_id in account_ids:
        try:
            details = client.get_account_details(access_token, gc_id)
        except httpx.HTTPStatusError:
            details = {}
        out.append(
            GcAccountOut(
                id=gc_id,
                iban=details.get("iban"),
                owner_name=details.get("owner_name"),
                institution_name=details.get("institution_id"),
            )
        )
    return out


def _link_account(conn: sqlite3.Connection, params: LinkAccountParams) -> AccountOut:
    updated = conn.execute(
        "UPDATE accounts"
        "    SET gocardless_account_id = ?, gocardless_requisition_id = ?"
        "  WHERE id = ?",
        (params.gocardless_account_id, params.requisition_id, params.finp_account_id),
    ).rowcount
    if updated == 0:
        raise AppError("account.not_found", f"Account {params.finp_account_id} not found.")
    from finp.accounts import get as get_account

    return AccountOut.model_validate(get_account(conn, params.finp_account_id))


def _sync_account(conn: sqlite3.Connection, params: SyncAccountParams) -> SyncResult:
    from finp.gocardless.sync import sync_account

    result = sync_account(conn, params.account_id)
    return SyncResult(**result)


METHODS: dict[str, Command] = {
    "gocardless.get_credentials": Command(EmptyParams, _get_credentials),
    "gocardless.save_credentials": Command(SaveCredentialsParams, _save_credentials),
    "gocardless.has_connection": Command(EmptyParams, _has_connection),
    "gocardless.list_institutions": Command(EmptyParams, _list_institutions),
    "gocardless.create_requisition": Command(CreateRequisitionParams, _create_requisition),
    "gocardless.get_requisition_status": Command(RequisitionStatusParams, _get_requisition_status),
    "gocardless.list_requisition_accounts": Command(
        ListRequisitionAccountsParams, _list_requisition_accounts
    ),
    "gocardless.link_account": Command(LinkAccountParams, _link_account),
    "gocardless.sync_account": Command(SyncAccountParams, _sync_account),
}
