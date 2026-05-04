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


def _row_to_account(row: sqlite3.Row) -> Account:
    raw = row["csv_mapping_json"]
    return Account(
        id=row["id"],
        name=row["name"],
        csv_mapping=json.loads(raw) if raw else None,
        created_at=row["created_at"],
    )


def create(conn: sqlite3.Connection, name: str) -> Account:
    """Create an account with a unique ``name``. Mapping is set later via import."""
    cur = conn.execute("INSERT INTO accounts (name) VALUES (?)", (name,))
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, account_id: int) -> Account:
    """Fetch an account by id. Raises ``AccountNotFoundError`` if missing."""
    row = conn.execute(
        "SELECT id, name, csv_mapping_json, created_at FROM accounts WHERE id = ?",
        (account_id,),
    ).fetchone()
    if row is None:
        raise AccountNotFoundError(f"account id={account_id}")
    return _row_to_account(row)


def list_all(conn: sqlite3.Connection) -> list[Account]:
    """Return all accounts ordered by name."""
    rows = conn.execute(
        "SELECT id, name, csv_mapping_json, created_at FROM accounts ORDER BY name"
    ).fetchall()
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


def delete(conn: sqlite3.Connection, account_id: int) -> None:
    """Delete an account. Cascades to its operations via FK ON DELETE CASCADE."""
    cur = conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    if cur.rowcount == 0:
        raise AccountNotFoundError(f"account id={account_id}")
