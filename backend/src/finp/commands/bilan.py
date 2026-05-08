"""``bilan.*`` commands: monthly aggregation + filter options.

Window: rolling 12 plain months ending at the current month (based on
``today``). Internal-type operations are excluded from totals.

The summary returns one row per ``(month, type, category)`` combination so
the frontend can shape it into stacked-bar columns. ``bilan.filter_options``
returns the categories actually used by debit / credit operations, plus the
list of accounts — used to populate the filter selects.
"""

from __future__ import annotations

import sqlite3
from datetime import date

from pydantic import BaseModel, ConfigDict

from finp.commands._base import Command, EmptyParams
from finp.commands.accounts import AccountOut
from finp.commands.categories import CategoryOut


def _bilan_window(today: date) -> tuple[str, str, list[str]]:
    """Return ``(start_iso, end_exclusive_iso, months[12])`` for ``today``.

    ``months`` is a list of 12 ``YYYY-MM`` strings, oldest first, with the
    last entry equal to the month containing ``today``.
    """
    end_y, end_m = today.year, today.month
    end = date(end_y + 1, 1, 1) if end_m == 12 else date(end_y, end_m + 1, 1)

    start_y, start_m = end_y, end_m - 11
    while start_m <= 0:
        start_m += 12
        start_y -= 1
    start = date(start_y, start_m, 1)

    months: list[str] = []
    y, m = start_y, start_m
    for _ in range(12):
        months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1

    return start.isoformat(), end.isoformat(), months


def _category_clause(
    ids: list[int] | None,
    include_no_category: bool,
) -> tuple[str, list[object]]:
    """Build a SQL fragment + params for a category filter.

    Returns ``("1", [])`` (no filter) when ``ids`` is ``None`` and
    ``include_no_category`` is False.
    """
    if ids is None and not include_no_category:
        return "1", []
    parts: list[str] = []
    params: list[object] = []
    if ids:
        parts.append(f"category_id IN ({','.join('?' * len(ids))})")
        params.extend(ids)
    if include_no_category:
        parts.append("category_id IS NULL")
    return ("(" + " OR ".join(parts) + ")") if parts else "0", params


class MonthSliceOut(BaseModel):
    """One bucket of the bilan: total spent / received in a category for a month."""

    month: str
    type: str
    category_id: int | None
    category_name: str | None
    total_cents: int
    is_planned: bool = False


class SummaryParams(BaseModel):
    today: str | None = None
    account_ids: list[int] | None = None
    debit_category_ids: list[int] | None = None
    credit_category_ids: list[int] | None = None
    include_no_category_debit: bool = False
    include_no_category_credit: bool = False


class SummaryOut(BaseModel):
    months: list[str]
    rows: list[MonthSliceOut]


class FilterOptionsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    accounts: list[AccountOut]
    debit_categories: list[CategoryOut]
    credit_categories: list[CategoryOut]
    debit_has_uncategorized: bool
    credit_has_uncategorized: bool


def _summary(conn: sqlite3.Connection, params: SummaryParams) -> SummaryOut:
    today = date.fromisoformat(params.today) if params.today else date.today()
    start, end, months = _bilan_window(today)

    where = ["date >= ?", "date < ?", "type IN ('debit', 'credit')"]
    sql_params: list[object] = [start, end]

    if params.account_ids:
        where.append(f"account_id IN ({','.join('?' * len(params.account_ids))})")
        sql_params.extend(params.account_ids)

    debit_sql, debit_params = _category_clause(
        params.debit_category_ids, params.include_no_category_debit
    )
    credit_sql, credit_params = _category_clause(
        params.credit_category_ids, params.include_no_category_credit
    )
    where.append(f"((type = 'debit' AND {debit_sql}) OR (type = 'credit' AND {credit_sql}))")
    sql_params.extend(debit_params)
    sql_params.extend(credit_params)

    sql = f"""
        SELECT
            strftime('%Y-%m', o.date) AS month,
            o.type AS type,
            o.category_id AS category_id,
            c.name AS category_name,
            SUM(o.montant_cents) AS total_cents
        FROM operations o
        LEFT JOIN categories c ON c.id = o.category_id
        WHERE {" AND ".join(where)}
        GROUP BY month, o.type, o.category_id
        ORDER BY month, o.type, c.name COLLATE NOCASE
    """

    rows = [
        MonthSliceOut(
            month=r["month"],
            type=r["type"],
            category_id=r["category_id"],
            category_name=r["category_name"],
            total_cents=r["total_cents"],
        )
        for r in conn.execute(sql, sql_params).fetchall()
    ]

    # Planned operations layered in as their own slice. Aggregated by month
    # and sign so the chart can render a single 'Opérations prévues' bucket
    # per month per side. They ignore filters — KPIs reflect realized data,
    # the planned series is informative only.
    from finp import planned_operations as planned

    planned_rows = planned.list_in_range(conn, start, end)
    planned_by_key: dict[tuple[str, str], int] = {}
    for p in planned_rows:
        month_key = p.date[:7]
        side = "debit" if p.montant_cents < 0 else "credit"
        planned_by_key[(month_key, side)] = planned_by_key.get((month_key, side), 0) + abs(
            p.montant_cents
        )
    for (month_key, side), total in planned_by_key.items():
        rows.append(
            MonthSliceOut(
                month=month_key,
                type=side,
                category_id=None,
                category_name="Opérations prévues",
                total_cents=total,
                is_planned=True,
            )
        )

    return SummaryOut(months=months, rows=rows)


def _filter_options(conn: sqlite3.Connection, _: EmptyParams) -> FilterOptionsOut:
    from finp import accounts

    accs = [AccountOut.model_validate(a) for a in accounts.list_all(conn)]

    def _categories_for(op_type: str) -> list[CategoryOut]:
        rows = conn.execute(
            "SELECT DISTINCT c.id, c.name, c.is_builtin, c.display_order"
            " FROM categories c JOIN operations o ON o.category_id = c.id"
            " WHERE o.type = ? ORDER BY c.name COLLATE NOCASE",
            (op_type,),
        ).fetchall()
        return [
            CategoryOut(
                id=r["id"],
                name=r["name"],
                is_builtin=bool(r["is_builtin"]),
                display_order=r["display_order"],
            )
            for r in rows
        ]

    def _has_uncategorized(op_type: str) -> bool:
        row = conn.execute(
            "SELECT 1 FROM operations WHERE type = ? AND category_id IS NULL LIMIT 1",
            (op_type,),
        ).fetchone()
        return row is not None

    return FilterOptionsOut(
        accounts=accs,
        debit_categories=_categories_for("debit"),
        credit_categories=_categories_for("credit"),
        debit_has_uncategorized=_has_uncategorized("debit"),
        credit_has_uncategorized=_has_uncategorized("credit"),
    )


METHODS: dict[str, Command] = {
    "bilan.summary": Command(SummaryParams, _summary),
    "bilan.filter_options": Command(EmptyParams, _filter_options),
}
