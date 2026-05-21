"""Accounts: CRUD over the ``accounts`` table.

A CSV column mapping is stored per account so re-imports don't re-prompt.
The mapping shape is opaque here — validation lives at the import boundary.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from typing import Any


class AccountNotFoundError(LookupError):
    """Raised when an account id has no row in the database."""


@dataclass(frozen=True, slots=True)
class Account:
    """A user-defined account (bank account, cash, etc.)."""

    id: int
    name: str
    csv_mapping: dict[str, Any] | None
    created_at: str
    # MAX(operations.created_at) for this account — i.e. the timestamp of
    # the most recent successful insert. Re-imports of the same rows
    # don't bump it (dedup skips them), so it tracks "last new data".
    last_import_at: str | None
    initial_balance_cents: int
    initial_balance_date: str | None
    # Running solde: initial balance + every operation on or after the
    # opening date (or every operation if no opening date is set).
    current_balance_cents: int
    gocardless_account_id: str | None
    gocardless_requisition_id: str | None
    gocardless_last_sync_at: str | None


def _row_to_account(row: sqlite3.Row) -> Account:
    raw = row["csv_mapping_json"]
    return Account(
        id=row["id"],
        name=row["name"],
        csv_mapping=json.loads(raw) if raw else None,
        created_at=row["created_at"],
        last_import_at=row["last_import_at"],
        initial_balance_cents=row["initial_balance_cents"],
        initial_balance_date=row["initial_balance_date"],
        current_balance_cents=row["current_balance_cents"],
        gocardless_account_id=row["gocardless_account_id"],
        gocardless_requisition_id=row["gocardless_requisition_id"],
        gocardless_last_sync_at=row["gocardless_last_sync_at"],
    )


_SELECT_ACCOUNT = (
    "SELECT a.id, a.name, a.csv_mapping_json, a.created_at,"
    " a.initial_balance_cents, a.initial_balance_date,"
    " a.gocardless_account_id, a.gocardless_requisition_id, a.gocardless_last_sync_at,"
    " (SELECT MAX(o.created_at) FROM operations o WHERE o.account_id = a.id) AS last_import_at,"
    " a.initial_balance_cents + COALESCE("
    "   (SELECT SUM(o.montant_cents) FROM operations o"
    "    WHERE o.account_id = a.id"
    "      AND (a.initial_balance_date IS NULL OR o.date >= a.initial_balance_date)),"
    "   0"
    " ) AS current_balance_cents"
    " FROM accounts a"
)


def create(conn: sqlite3.Connection, name: str) -> Account:
    """Create an account with a unique ``name``. Mapping is set later via import."""
    cur = conn.execute("INSERT INTO accounts (name) VALUES (?)", (name,))
    assert cur.lastrowid is not None
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, account_id: int) -> Account:
    """Fetch an account by id. Raises ``AccountNotFoundError`` if missing."""
    row = conn.execute(f"{_SELECT_ACCOUNT} WHERE a.id = ?", (account_id,)).fetchone()
    if row is None:
        raise AccountNotFoundError(f"account id={account_id}")
    return _row_to_account(row)


def list_all(conn: sqlite3.Connection) -> list[Account]:
    """Return all accounts ordered by name."""
    rows = conn.execute(f"{_SELECT_ACCOUNT} ORDER BY a.name").fetchall()
    return [_row_to_account(r) for r in rows]


def rename(conn: sqlite3.Connection, account_id: int, new_name: str) -> Account:
    """Change an account's display name."""
    cur = conn.execute("UPDATE accounts SET name = ? WHERE id = ?", (new_name, account_id))
    if cur.rowcount == 0:
        raise AccountNotFoundError(f"account id={account_id}")
    return get(conn, account_id)


def set_csv_mapping(
    conn: sqlite3.Connection,
    account_id: int,
    mapping: dict[str, Any] | None,
) -> Account:
    """Store (or clear) the CSV column mapping used when importing for this account."""
    encoded = json.dumps(mapping) if mapping is not None else None
    cur = conn.execute(
        "UPDATE accounts SET csv_mapping_json = ? WHERE id = ?",
        (encoded, account_id),
    )
    if cur.rowcount == 0:
        raise AccountNotFoundError(f"account id={account_id}")
    return get(conn, account_id)


def set_initial_balance(
    conn: sqlite3.Connection,
    account_id: int,
    *,
    cents: int,
    date: str | None,
) -> Account:
    """Set the opening balance + its anchor date for the running solde."""
    cur = conn.execute(
        "UPDATE accounts SET initial_balance_cents = ?, initial_balance_date = ? WHERE id = ?",
        (cents, date, account_id),
    )
    if cur.rowcount == 0:
        raise AccountNotFoundError(f"account id={account_id}")
    return get(conn, account_id)


def delete(conn: sqlite3.Connection, account_id: int) -> None:
    """Delete an account. Cascades to its operations via FK ON DELETE CASCADE."""
    cur = conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    if cur.rowcount == 0:
        raise AccountNotFoundError(f"account id={account_id}")
