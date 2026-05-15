"""Operations: insertion (with dedup + type derivation), listing, search.

Money is stored as integer cents. Type is derived:
    - assigned to ``Virement interne`` → ``internal``
    - else montant < 0 → ``debit``
    - else                → ``credit``

Insert is idempotent: duplicates (same account + date + montant + libellé)
are silently skipped and ``insert`` returns ``None``.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
from dataclasses import dataclass

from finp import categories, events

OperationType = str  # one of: 'debit', 'credit', 'internal'


@dataclass(frozen=True, slots=True)
class Operation:
    """A single financial movement on an account."""

    id: int
    account_id: int
    date: str
    montant_cents: int
    libelle: str
    type: OperationType
    category_id: int | None
    dedup_hash: str
    created_at: str
    is_recurring: bool = False


def _row_to_op(row: sqlite3.Row) -> Operation:
    return Operation(
        id=row["id"],
        account_id=row["account_id"],
        date=row["date"],
        montant_cents=row["montant_cents"],
        libelle=row["libelle"],
        type=row["type"],
        category_id=row["category_id"],
        dedup_hash=row["dedup_hash"],
        created_at=row["created_at"],
        is_recurring=bool(row["is_recurring"]),
    )


def _dedup_hash(account_id: int, date: str, montant_cents: int, libelle: str) -> str:
    payload = f"{account_id}|{date}|{montant_cents}|{libelle.strip()}".encode()
    return hashlib.sha256(payload).hexdigest()


def find_by_content(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    date: str,
    montant_cents: int,
    libelle: str,
) -> Operation | None:
    """Return the existing operation that would dedup-collide with these values."""
    h = _dedup_hash(account_id, date, montant_cents, libelle)
    row = conn.execute(
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, is_recurring FROM operations WHERE dedup_hash = ?",
        (h,),
    ).fetchone()
    return _row_to_op(row) if row else None


def _derive_type(montant_cents: int, category_id: int | None, internal_id: int) -> OperationType:
    if category_id == internal_id:
        return "internal"
    return "debit" if montant_cents < 0 else "credit"


def insert(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    date: str,
    montant_cents: int,
    libelle: str,
) -> Operation | None:
    """Insert an operation. Returns ``None`` if a duplicate was skipped.

    Type is derived from the montant sign. Categories are assigned later
    (manually or by the rules engine).
    """
    dedup = _dedup_hash(account_id, date, montant_cents, libelle)
    op_type: OperationType = "debit" if montant_cents < 0 else "credit"

    cur = conn.execute(
        "INSERT INTO operations(account_id, date, montant_cents, libelle, type, dedup_hash)"
        " VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_hash) DO NOTHING",
        (account_id, date, montant_cents, libelle, op_type, dedup),
    )
    if cur.rowcount == 0:
        return None

    op = get(conn, cur.lastrowid)
    events.bus.publish(events.OPERATION_CREATED, {"id": op.id, "account_id": account_id})
    return op


def get(conn: sqlite3.Connection, op_id: int) -> Operation:
    """Fetch a single operation by id."""
    row = conn.execute(
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, is_recurring FROM operations WHERE id = ?",
        (op_id,),
    ).fetchone()
    if row is None:
        raise LookupError(f"operation id={op_id}")
    return _row_to_op(row)


def assign_category(
    conn: sqlite3.Connection,
    op_id: int,
    category_id: int | None,
) -> Operation:
    """Set (or clear) the category on an operation, re-deriving its type.

    Assigning the built-in ``Virement interne`` flips type to ``internal``;
    clearing or assigning any other category flips it back to debit/credit
    based on the montant sign.
    """
    op = get(conn, op_id)
    internal_id = categories.get_builtin_internal_transfer(conn).id

    if category_id is not None:
        categories.get(conn, category_id)

    new_type = _derive_type(op.montant_cents, category_id, internal_id)
    conn.execute(
        "UPDATE operations SET category_id = ?, type = ? WHERE id = ?",
        (category_id, new_type, op_id),
    )

    events.bus.publish(
        events.OPERATION_CATEGORY_ASSIGNED,
        {"id": op_id, "category_id": category_id, "type": new_type},
    )
    return get(conn, op_id)


_FTS_TOKEN_RE = re.compile(r"\w+", re.UNICODE)


def _build_fts_query(text: str) -> str:
    """Turn a free-form search string into an FTS5 prefix-MATCH expression.

    Splits on word characters, lowercases, and appends ``*`` for prefix
    matching. Returns an empty string if the input has no usable tokens.
    """
    tokens = _FTS_TOKEN_RE.findall(text.lower())
    return " ".join(f"{tok}*" for tok in tokens)


_MONTANT_OPS = {">", "<", "=="}


def set_recurring(conn: sqlite3.Connection, op_id: int, is_recurring: bool) -> Operation:
    """Toggle the recurring flag on an operation."""
    conn.execute(
        "UPDATE operations SET is_recurring = ? WHERE id = ?",
        (1 if is_recurring else 0, op_id),
    )
    return get(conn, op_id)


def list_(
    conn: sqlite3.Connection,
    *,
    account_ids: list[int] | None = None,
    category_ids: list[int] | None = None,
    include_no_category: bool = False,
    types: list[OperationType] | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    search: str | None = None,
    montant_op: str | None = None,
    montant_value_cents: int | None = None,
    recurring_only: bool = False,
    limit: int | None = None,
    offset: int = 0,
) -> list[Operation]:
    """List operations matching the given filters, newest first.

    ``include_no_category`` is OR'd with ``category_ids``: passing both means
    "any of these categories OR uncategorized". Passing neither leaves the
    category dimension unfiltered.
    """
    where: list[str] = []
    params: list[object] = []

    if account_ids:
        where.append(f"account_id IN ({','.join('?' * len(account_ids))})")
        params.extend(account_ids)

    cat_clauses: list[str] = []
    if category_ids:
        cat_clauses.append(f"category_id IN ({','.join('?' * len(category_ids))})")
        params.extend(category_ids)
    if include_no_category:
        cat_clauses.append("category_id IS NULL")
    if cat_clauses:
        where.append("(" + " OR ".join(cat_clauses) + ")")

    if types:
        where.append(f"type IN ({','.join('?' * len(types))})")
        params.extend(types)

    if date_from:
        where.append("date >= ?")
        params.append(date_from)
    if date_to:
        where.append("date <= ?")
        params.append(date_to)

    if search:
        fts = _build_fts_query(search)
        if fts:
            where.append("id IN (SELECT rowid FROM operations_fts WHERE operations_fts MATCH ?)")
            params.append(fts)

    if montant_op is not None and montant_value_cents is not None:
        if montant_op not in _MONTANT_OPS:
            raise ValueError(f"unsupported montant_op: {montant_op!r}")
        # Filter on absolute value: '|montant| op value'. SQLite ABS() handles
        # the sign so the same filter works for debits and credits.
        where.append(f"ABS(montant_cents) {montant_op} ?")
        params.append(abs(montant_value_cents))

    if recurring_only:
        where.append("is_recurring = 1")

    sql = (
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, is_recurring FROM operations"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY date DESC, id DESC"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    rows = conn.execute(sql, params).fetchall()
    return [_row_to_op(r) for r in rows]
