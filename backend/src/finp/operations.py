"""Operations: insertion (with dedup + type derivation), listing, search.

Money is stored as integer cents. Type is derived:
    - assigned to ``Virement interne`` → ``internal``
    - else montant < 0 → ``debit``
    - else                → ``credit``

Insert is idempotent: duplicates are silently skipped and ``insert`` returns
``None``. The dedup hash covers account + date + montant + libellé + balance
(when balance is present). Including balance disambiguates two real
transactions on the same day with the same amount and label.
"""

from __future__ import annotations

import hashlib
import re
import sqlite3
import uuid
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
    recurring: str = "none"  # 'none' | 'monthly' | 'yearly'
    balance_cents: int | None = None


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
        recurring=row["recurring"],
        balance_cents=row["balance_cents"],
    )


def _dedup_hash(
    account_id: int,
    date: str,
    montant_cents: int,
    libelle: str,
    balance_cents: int | None = None,
) -> str:
    base = f"{account_id}|{date}|{montant_cents}|{libelle.strip()}"
    payload = (base if balance_cents is None else f"{base}|{balance_cents}").encode()
    return hashlib.sha256(payload).hexdigest()


def find_by_content(
    conn: sqlite3.Connection,
    *,
    account_id: int,
    date: str,
    montant_cents: int,
    libelle: str,
    balance_cents: int | None = None,
) -> Operation | None:
    """Return the existing operation that would dedup-collide with these values."""
    h = _dedup_hash(account_id, date, montant_cents, libelle, balance_cents)
    row = conn.execute(
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, recurring, balance_cents FROM operations WHERE dedup_hash = ?",
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
    balance_cents: int | None = None,
) -> Operation | None:
    """Insert an operation. Returns ``None`` if a duplicate was skipped.

    Type is derived from the montant sign. Categories are assigned later
    (manually or by the rules engine).
    """
    dedup = _dedup_hash(account_id, date, montant_cents, libelle, balance_cents)
    op_type: OperationType = "debit" if montant_cents < 0 else "credit"

    cur = conn.execute(
        "INSERT INTO operations"
        "(account_id, date, montant_cents, libelle, type, dedup_hash, balance_cents)"
        " VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(dedup_hash) DO NOTHING",
        (account_id, date, montant_cents, libelle, op_type, dedup, balance_cents),
    )
    if cur.rowcount == 0:
        return None

    assert cur.lastrowid is not None
    op = get(conn, cur.lastrowid)
    events.bus.publish(events.OPERATION_CREATED, {"id": op.id, "account_id": account_id})
    return op


def create_duplicate(conn: sqlite3.Connection, op_id: int) -> Operation:
    """Insert a copy of ``op_id`` with a fresh, unique dedup_hash.

    Used to undo a wrongly-skipped import dedup: the user confirms that
    the incoming row was not actually a duplicate of the existing one,
    so a second distinct operation is inserted alongside it.
    """
    src = get(conn, op_id)
    nonce = uuid.uuid4().hex
    base = f"{src.account_id}|{src.date}|{src.montant_cents}|{src.libelle.strip()}"
    if src.balance_cents is not None:
        base = f"{base}|{src.balance_cents}"
    dedup = hashlib.sha256(f"{base}|dup:{nonce}".encode()).hexdigest()

    cur = conn.execute(
        "INSERT INTO operations"
        "(account_id, date, montant_cents, libelle, type, dedup_hash, balance_cents)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            src.account_id,
            src.date,
            src.montant_cents,
            src.libelle,
            src.type,
            dedup,
            src.balance_cents,
        ),
    )
    assert cur.lastrowid is not None
    op = get(conn, cur.lastrowid)
    events.bus.publish(events.OPERATION_CREATED, {"id": op.id, "account_id": src.account_id})
    return op


def get(conn: sqlite3.Connection, op_id: int) -> Operation:
    """Fetch a single operation by id."""
    row = conn.execute(
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, recurring, balance_cents FROM operations WHERE id = ?",
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


def _term_to_predicate(term: str) -> tuple[str, object] | None:
    """Compile one search term into a (sql_predicate, bind_param) pair.

    Terms containing ``*`` are routed to a SQL ``LIKE`` on ``libelle``
    (``*`` becomes ``%``); other terms use the FTS5 prefix index.
    Returns ``None`` if the term has no searchable content.
    """
    stripped = term.strip()
    if not stripped:
        return None
    if "*" in stripped:
        escaped = stripped.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = escaped.replace("*", "%")
        return ("libelle LIKE ? ESCAPE '\\'", pattern)
    fts = _build_fts_query(stripped)
    if not fts:
        return None
    return ("id IN (SELECT rowid FROM operations_fts WHERE operations_fts MATCH ?)", fts)


_VALID_COMBINATORS = {"AND", "OR", "XOR"}


_MONTANT_OPS = {">", "<", "=="}


_VALID_RECURRING = {"none", "monthly", "yearly"}


def set_recurring(conn: sqlite3.Connection, op_id: int, recurring: str) -> Operation:
    """Set the recurring cadence on an operation."""
    if recurring not in _VALID_RECURRING:
        raise ValueError(f"invalid recurring value: {recurring!r}")
    conn.execute(
        "UPDATE operations SET recurring = ? WHERE id = ?",
        (recurring, op_id),
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
    search_terms: list[str] | None = None,
    search_combinator: str = "AND",
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

    if search_terms:
        if search_combinator not in _VALID_COMBINATORS:
            raise ValueError(f"invalid search_combinator: {search_combinator!r}")
        compiled = [c for t in search_terms if (c := _term_to_predicate(t)) is not None]
        if compiled:
            preds = [c[0] for c in compiled]
            term_params = [c[1] for c in compiled]
            if len(preds) == 1 or search_combinator == "AND":
                where.append("(" + " AND ".join(preds) + ")")
            elif search_combinator == "OR":
                where.append("(" + " OR ".join(preds) + ")")
            else:  # XOR — exactly one term matches
                summed = " + ".join(f"({p})" for p in preds)
                where.append(f"({summed}) = 1")
            params.extend(term_params)

    if montant_op is not None and montant_value_cents is not None:
        if montant_op not in _MONTANT_OPS:
            raise ValueError(f"unsupported montant_op: {montant_op!r}")
        # Filter on absolute value: '|montant| op value'. SQLite ABS() handles
        # the sign so the same filter works for debits and credits.
        where.append(f"ABS(montant_cents) {montant_op} ?")
        params.append(abs(montant_value_cents))

    if recurring_only:
        where.append("recurring != 'none'")

    sql = (
        "SELECT id, account_id, date, montant_cents, libelle, type, category_id,"
        " dedup_hash, created_at, recurring, balance_cents FROM operations"
    )
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY date DESC, id DESC"
    if limit is not None:
        sql += " LIMIT ? OFFSET ?"
        params.extend([limit, offset])

    rows = conn.execute(sql, params).fetchall()
    return [_row_to_op(r) for r in rows]
