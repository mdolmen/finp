"""GoCardless transaction sync: fetch → normalise → ingest.

GoCardless transaction IDs (``transactionId``) are used directly as
``dedup_hash`` so that re-syncing the same date range never creates
duplicates, even if the description changes.

Pending transactions are skipped: they lack ``transactionId``, so they
cannot be deduped reliably across syncs.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import date as date_cls

import httpx

from finp import events, rules_engine
from finp.errors import AppError
from finp.gocardless import auth, client

log = logging.getLogger(__name__)


def _cents(amount: dict) -> int:
    """Convert ``{"amount": "12.34", "currency": "EUR"}`` to signed cents."""
    raw = str(amount["amount"])
    sign = -1 if raw.startswith("-") else 1
    digits = raw.lstrip("+-")
    if "." in digits:
        whole, frac = digits.split(".", 1)
    else:
        whole, frac = digits, ""
    frac = (frac + "00")[:2]
    return sign * (int(whole or "0") * 100 + int(frac or "0"))


def _libelle(txn: dict) -> str:
    """Pick the best human-readable description for the operation row.

    GoCardless surfaces several free-text fields; banks fill them inconsistently.
    Falls back to counterparty name when remittance info is empty.
    """
    candidates = [
        txn.get("remittanceInformationUnstructured"),
        " ".join(txn.get("remittanceInformationUnstructuredArray") or []),
        txn.get("creditorName"),
        txn.get("debtorName"),
        txn.get("additionalInformation"),
    ]
    for c in candidates:
        if c and c.strip():
            return c.strip()
    return "—"


def sync_account(conn: sqlite3.Connection, account_id: int) -> dict:
    """Fetch new GoCardless transactions and ingest them through the standard pipeline.

    Uses ``gocardless_last_sync_at`` for incremental sync; fetches the bank's
    maximum history on first run. Returns ``{"imported": int, "skipped": int}``.
    """
    row = conn.execute(
        "SELECT gocardless_account_id, gocardless_last_sync_at FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if row is None:
        raise AppError("account.not_found", f"Account {account_id} not found.")
    gc_account_id: str | None = row["gocardless_account_id"]
    if not gc_account_id:
        raise AppError(
            "gocardless.not_linked",
            f"Account {account_id} is not linked to GoCardless.",
        )

    access_token = auth.access_token_or_refresh(conn)
    date_from: str | None = row["gocardless_last_sync_at"]

    try:
        payload = client.list_transactions(access_token, gc_account_id, date_from=date_from)
    except httpx.HTTPStatusError as exc:
        log.error(
            "sync_account fetch failed: status=%d body=%s",
            exc.response.status_code,
            exc.response.text[:500],
        )
        raise AppError(
            "gocardless.sync_failed",
            f"GoCardless transactions fetch failed ({exc.response.status_code}):"
            f" {exc.response.text[:200]}",
        ) from exc

    booked = (payload.get("transactions") or {}).get("booked") or []

    imported = 0
    skipped = 0
    for txn in booked:
        txn_id = txn.get("transactionId")
        if not txn_id:
            # Without a stable id we cannot dedup, so we skip rather than
            # risking duplicates on the next sync.
            skipped += 1
            continue
        date: str = txn.get("bookingDate") or txn.get("valueDate")
        montant_cents = _cents(txn["transactionAmount"])
        libelle = _libelle(txn)
        op_type = "debit" if montant_cents < 0 else "credit"

        cur = conn.execute(
            "INSERT INTO operations(account_id, date, montant_cents, libelle, type, dedup_hash)"
            " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_hash) DO NOTHING",
            (account_id, date, montant_cents, libelle, op_type, txn_id),
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
        "UPDATE accounts SET gocardless_last_sync_at = ? WHERE id = ?",
        (date_cls.today().isoformat(), account_id),
    )

    return {"imported": imported, "skipped": skipped}
