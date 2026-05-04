"""Rules engine: apply rules to operations.

First-match-wins semantics, walking rules in the same global order as the
Règles page (category name, then priority within category). Manual
classification wins: an operation that already has a category is left
alone.
"""

from __future__ import annotations

import sqlite3

from finp import events, operations, rules
from finp.operations import Operation


def apply_rules(conn: sqlite3.Connection, op: Operation) -> Operation:
    """Apply rules to a single operation. Returns the (possibly updated) op.

    No-op if the operation already has a category. Otherwise the first
    enabled rule whose predicate matches assigns its target category.
    """
    if op.category_id is not None:
        return op

    for rule in rules.list_all(conn):
        if not rule.enabled:
            continue
        if rule.predicate.matches(op):
            updated = operations.assign_category(conn, op.id, rule.category_id)
            events.bus.publish(
                events.RULE_MATCHED,
                {"rule_id": rule.id, "operation_id": op.id, "category_id": rule.category_id},
            )
            return updated

    return op


def apply_rules_bulk(conn: sqlite3.Connection) -> int:
    """Apply rules to every uncategorized operation. Returns the number assigned.

    Rules are loaded once and walked in-memory per operation to avoid a
    re-query for each row.
    """
    all_rules = [r for r in rules.list_all(conn) if r.enabled]
    if not all_rules:
        return 0

    uncategorized = operations.list_(conn, include_no_category=True)

    assigned = 0
    for op in uncategorized:
        for rule in all_rules:
            if rule.predicate.matches(op):
                operations.assign_category(conn, op.id, rule.category_id)
                events.bus.publish(
                    events.RULE_MATCHED,
                    {"rule_id": rule.id, "operation_id": op.id, "category_id": rule.category_id},
                )
                assigned += 1
                break
    return assigned
