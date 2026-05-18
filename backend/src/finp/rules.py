"""Rules: CRUD over the ``rules`` table, ordered by priority within a category.

Rules pair a predicate with a target category. The rules engine (separate
module) walks them in priority order and assigns the first match to
operations that don't yet have a category.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass

from finp import categories, predicates
from finp.predicates import Predicate


class RuleNotFoundError(LookupError):
    """Raised when a rule id has no row in the database."""


@dataclass(frozen=True, slots=True)
class Rule:
    """A predicate + target category, evaluated in priority order."""

    id: int
    name: str
    category_id: int
    priority: int
    predicate: Predicate
    enabled: bool
    created_at: str


def _row_to_rule(row: sqlite3.Row) -> Rule:
    return Rule(
        id=row["id"],
        name=row["name"],
        category_id=row["category_id"],
        priority=row["priority"],
        predicate=predicates.from_dict(json.loads(row["predicate_json"])),
        enabled=bool(row["enabled"]),
        created_at=row["created_at"],
    )


def _next_priority(conn: sqlite3.Connection, category_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(priority), -1) + 1 AS next FROM rules WHERE category_id = ?",
        (category_id,),
    ).fetchone()
    return int(row["next"])


def create(
    conn: sqlite3.Connection,
    *,
    name: str,
    category_id: int,
    predicate: Predicate,
    enabled: bool = True,
    priority: int | None = None,
) -> Rule:
    """Create a rule. Defaults ``priority`` to the next slot in its category."""
    categories.get(conn, category_id)
    pri = _next_priority(conn, category_id) if priority is None else priority

    cur = conn.execute(
        "INSERT INTO rules(name, category_id, priority, predicate_json, enabled)"
        " VALUES (?, ?, ?, ?, ?)",
        (name, category_id, pri, json.dumps(predicate.to_dict()), int(enabled)),
    )
    assert cur.lastrowid is not None
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, rule_id: int) -> Rule:
    """Fetch a rule by id. Raises ``RuleNotFoundError`` if missing."""
    row = conn.execute(
        "SELECT id, name, category_id, priority, predicate_json, enabled, created_at"
        " FROM rules WHERE id = ?",
        (rule_id,),
    ).fetchone()
    if row is None:
        raise RuleNotFoundError(f"rule id={rule_id}")
    return _row_to_rule(row)


def list_all(conn: sqlite3.Connection, *, category_id: int | None = None) -> list[Rule]:
    """List rules, ordered by category name then priority then id.

    Pass ``category_id`` to scope to one category.
    """
    sql = (
        "SELECT r.id, r.name, r.category_id, r.priority, r.predicate_json,"
        " r.enabled, r.created_at FROM rules r JOIN categories c ON c.id = r.category_id"
    )
    params: list[object] = []
    if category_id is not None:
        sql += " WHERE r.category_id = ?"
        params.append(category_id)
    sql += " ORDER BY c.name COLLATE NOCASE, r.priority, r.id"
    rows = conn.execute(sql, params).fetchall()
    return [_row_to_rule(r) for r in rows]


def update(
    conn: sqlite3.Connection,
    rule_id: int,
    *,
    name: str | None = None,
    category_id: int | None = None,
    predicate: Predicate | None = None,
    enabled: bool | None = None,
) -> Rule:
    """Partial update. Pass only the fields to change.

    Moving a rule across categories appends it to the new category's order.
    """
    existing = get(conn, rule_id)
    sets: list[str] = []
    params: list[object] = []

    if name is not None:
        sets.append("name = ?")
        params.append(name)
    if category_id is not None and category_id != existing.category_id:
        categories.get(conn, category_id)
        sets.append("category_id = ?")
        params.append(category_id)
        sets.append("priority = ?")
        params.append(_next_priority(conn, category_id))
    if predicate is not None:
        sets.append("predicate_json = ?")
        params.append(json.dumps(predicate.to_dict()))
    if enabled is not None:
        sets.append("enabled = ?")
        params.append(int(enabled))

    if sets:
        params.append(rule_id)
        conn.execute(f"UPDATE rules SET {', '.join(sets)} WHERE id = ?", params)

    return get(conn, rule_id)


def delete(conn: sqlite3.Connection, rule_id: int) -> None:
    """Delete a rule. Other rules' priorities are not renumbered."""
    cur = conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
    if cur.rowcount == 0:
        raise RuleNotFoundError(f"rule id={rule_id}")


def reorder_in_category(
    conn: sqlite3.Connection,
    category_id: int,
    rule_ids: list[int],
) -> None:
    """Reorder rules within ``category_id``: index in ``rule_ids`` becomes priority.

    ``rule_ids`` must contain exactly the ids of every rule in that category;
    a mismatch is rejected to avoid partial reorders.
    """
    existing = {r.id for r in list_all(conn, category_id=category_id)}
    if existing != set(rule_ids):
        raise ValueError(
            f"rule_ids must match exactly the rules in category {category_id}: "
            f"got {sorted(rule_ids)}, expected {sorted(existing)}"
        )
    for priority, rid in enumerate(rule_ids):
        conn.execute("UPDATE rules SET priority = ? WHERE id = ?", (priority, rid))
