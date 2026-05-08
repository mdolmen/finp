"""Planned operations: anticipated future debits/credits.

Represented separately from realized ``operations`` because they don't
participate in dedup or rules. They show up only on the Bilan as an
'Opérations prévues' slice with dashed borders.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass


class PlannedOperationNotFoundError(LookupError):
    """Raised when a planned operation id has no row in the database."""


@dataclass(frozen=True, slots=True)
class PlannedOperation:
    """A scheduled / anticipated operation. Sign of ``montant_cents`` = direction."""

    id: int
    date: str
    montant_cents: int
    libelle: str
    created_at: str


def _row_to_op(row: sqlite3.Row) -> PlannedOperation:
    return PlannedOperation(
        id=row["id"],
        date=row["date"],
        montant_cents=row["montant_cents"],
        libelle=row["libelle"],
        created_at=row["created_at"],
    )


_SELECT = "SELECT id, date, montant_cents, libelle, created_at FROM planned_operations"


def create(
    conn: sqlite3.Connection,
    *,
    date: str,
    montant_cents: int,
    libelle: str,
) -> PlannedOperation:
    """Create a planned operation."""
    cur = conn.execute(
        "INSERT INTO planned_operations(date, montant_cents, libelle) VALUES (?, ?, ?)",
        (date, montant_cents, libelle),
    )
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, planned_id: int) -> PlannedOperation:
    """Fetch a planned operation by id."""
    row = conn.execute(f"{_SELECT} WHERE id = ?", (planned_id,)).fetchone()
    if row is None:
        raise PlannedOperationNotFoundError(f"planned operation id={planned_id}")
    return _row_to_op(row)


def list_all(conn: sqlite3.Connection) -> list[PlannedOperation]:
    """Return every planned operation ordered by date."""
    rows = conn.execute(f"{_SELECT} ORDER BY date").fetchall()
    return [_row_to_op(r) for r in rows]


def list_in_range(
    conn: sqlite3.Connection, start_iso: str, end_exclusive_iso: str
) -> list[PlannedOperation]:
    """Return planned operations whose ``date`` falls in ``[start, end)``."""
    rows = conn.execute(
        f"{_SELECT} WHERE date >= ? AND date < ? ORDER BY date",
        (start_iso, end_exclusive_iso),
    ).fetchall()
    return [_row_to_op(r) for r in rows]


def delete(conn: sqlite3.Connection, planned_id: int) -> None:
    """Delete a planned operation by id."""
    cur = conn.execute("DELETE FROM planned_operations WHERE id = ?", (planned_id,))
    if cur.rowcount == 0:
        raise PlannedOperationNotFoundError(f"planned operation id={planned_id}")
