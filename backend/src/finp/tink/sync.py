"""Tink transaction sync: fetch → normalise → ingest.

Tink transaction IDs are used directly as dedup_hash so that re-syncing the
same date range never creates duplicates, regardless of description changes.

Amount convention: Tink encodes amounts as {unscaledValue, scale} where
value = unscaledValue / 10^scale. For EUR (scale=2) unscaledValue is cents.
Negative values are debits (money leaving the account).
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import date as date_cls

import httpx

from finp import events, rules_engine
from finp.errors import AppError
from finp.tink import auth as tink_auth
from finp.tink import client as tink_client
from finp.tink.credentials import get as get_credentials

log = logging.getLogger(__name__)


def _cents(amount: dict) -> int:
    unscaled = int(amount["value"]["unscaledValue"])
    scale = int(amount["value"]["scale"])
    return round(unscaled * (10 ** (2 - scale)))


def _libelle(descriptions: dict) -> str:
    return (descriptions.get("display") or descriptions.get("original") or "").strip() or "—"


def _fetch_all(access_token: str, tink_account_id: str, *, date_from: str | None) -> list[dict]:
    """Paginate through all pages of BOOKED transactions."""
    txns: list[dict] = []
    page_token: str | None = None
    while True:
        page = tink_client.list_transactions(
            access_token,
            tink_account_id,
            page_token=page_token,
            date_from=date_from,
        )
        txns.extend(page.get("transactions", []))
        page_token = page.get("nextPageToken")
        if not page_token:
            break
    return txns


def sync_account(conn: sqlite3.Connection, account_id: int) -> dict:
    """Fetch new Tink transactions and ingest them through the standard pipeline.

    Uses tink_last_sync_at for incremental sync; fetches full history on first run.
    Returns {"imported": int, "skipped": int}.
    """
    row = conn.execute(
        "SELECT tink_account_id, tink_last_sync_at FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if row is None:
        raise AppError("account.not_found", f"Account {account_id} not found.")
    if not row["tink_account_id"]:
        raise AppError("tink.not_linked", f"Account {account_id} is not linked to Tink.")

    tink_account_id: str = row["tink_account_id"]
    date_from: str | None = row["tink_last_sync_at"]

    creds = get_credentials(conn)
    if creds is None:
        raise AppError("tink.no_credentials", "Tink credentials not configured.")
    token_row = conn.execute(
        "SELECT tink_user_id FROM tink_tokens ORDER BY rowid DESC LIMIT 1"
    ).fetchone()
    if token_row is None:
        raise AppError("tink.no_tokens", "No Tink connection. Complete OAuth first.")
    access_token = tink_auth.refresh_token_if_needed(
        conn, creds["client_id"], creds["client_secret"], token_row["tink_user_id"]
    )

    try:
        txns = _fetch_all(access_token, tink_account_id, date_from=date_from)
    except httpx.HTTPStatusError as exc:
        log.error(
            "sync_account fetch failed: status=%d body=%s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        raise AppError(
            "tink.sync_failed",
            f"Tink transactions fetch failed ({exc.response.status_code}):"
            f" {exc.response.text[:200]}",
        ) from exc

    imported = 0
    skipped = 0
    for txn in txns:
        tink_id: str = txn["id"]
        date: str = txn["dates"]["booked"]
        montant_cents = _cents(txn["amount"])
        libelle = _libelle(txn.get("descriptions", {}))
        op_type = "debit" if montant_cents < 0 else "credit"

        cur = conn.execute(
            "INSERT INTO operations(account_id, date, montant_cents, libelle, type, dedup_hash)"
            " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_hash) DO NOTHING",
            (account_id, date, montant_cents, libelle, op_type, tink_id),
        )
        if cur.rowcount == 0:
            skipped += 1
        else:
            assert cur.lastrowid is not None
            events.bus.publish(
                events.OPERATION_CREATED, {"id": cur.lastrowid, "account_id": account_id}
            )
            imported += 1

    if imported > 0:
        rules_engine.apply_rules_bulk(conn)

    conn.execute(
        "UPDATE accounts SET tink_last_sync_at = ? WHERE id = ?",
        (date_cls.today().isoformat(), account_id),
    )

    return {"imported": imported, "skipped": skipped}
