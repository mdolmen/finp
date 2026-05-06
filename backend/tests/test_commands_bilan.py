import json
from datetime import date

from finp import accounts as accounts_mod
from finp import categories as categories_mod
from finp import operations as operations_mod
from finp import rpc
from finp.commands.bilan import _bilan_window


def _call(conn, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def _seed(conn, acc_id, *, date_str, montant, libelle, dedup, category_id=None, type_=None):
    inferred_type = type_ or ("debit" if montant < 0 else "credit")
    conn.execute(
        "INSERT INTO operations(account_id, date, montant_cents, libelle, type,"
        " category_id, dedup_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (acc_id, date_str, montant, libelle, inferred_type, category_id, dedup),
    )


def test_window_rolling_12_months():
    start, end, months = _bilan_window(date(2026, 5, 15))
    assert start == "2025-06-01"
    assert end == "2026-06-01"
    assert months[0] == "2025-06"
    assert months[-1] == "2026-05"
    assert len(months) == 12


def test_window_december_year_rollover():
    start, end, months = _bilan_window(date(2025, 12, 1))
    assert start == "2025-01-01"
    assert end == "2026-01-01"
    assert months[0] == "2025-01"
    assert months[-1] == "2025-12"


def test_summary_excludes_internal(conn):
    acc = accounts_mod.create(conn, "Main")
    food = categories_mod.create(conn, "Food")
    internal = categories_mod.get_builtin_internal_transfer(conn)

    _seed(conn, acc.id, date_str="2026-01-15", montant=-1000, libelle="Lunch", dedup="h1")
    op = operations_mod.get(
        conn,
        conn.execute("SELECT id FROM operations WHERE dedup_hash = 'h1'").fetchone()[0],
    )
    operations_mod.assign_category(conn, op.id, food.id)
    _seed(
        conn,
        acc.id,
        date_str="2026-01-20",
        montant=-500,
        libelle="Transfer",
        dedup="h2",
        category_id=internal.id,
        type_="internal",
    )

    r = _call(conn, "bilan.summary", {"today": "2026-05-15"})
    rows = r["result"]["rows"]
    assert all(row["type"] != "internal" for row in rows)
    assert any(row["category_name"] == "Food" for row in rows)


def test_summary_window_excludes_outside_range(conn):
    acc = accounts_mod.create(conn, "Main")
    _seed(conn, acc.id, date_str="2024-01-01", montant=-100, libelle="old", dedup="h1")
    _seed(conn, acc.id, date_str="2026-03-01", montant=-200, libelle="recent", dedup="h2")

    r = _call(conn, "bilan.summary", {"today": "2026-05-15"})
    rows = r["result"]["rows"]
    assert len(rows) == 1
    assert rows[0]["month"] == "2026-03"


def test_summary_account_filter(conn):
    a1 = accounts_mod.create(conn, "A1")
    a2 = accounts_mod.create(conn, "A2")
    _seed(conn, a1.id, date_str="2026-03-01", montant=-100, libelle="x", dedup="h1")
    _seed(conn, a2.id, date_str="2026-03-01", montant=-200, libelle="y", dedup="h2")

    r = _call(conn, "bilan.summary", {"today": "2026-05-15", "account_ids": [a1.id]})
    rows = r["result"]["rows"]
    assert len(rows) == 1
    assert rows[0]["total_cents"] == -100


def test_summary_debit_category_filter_keeps_all_credits(conn):
    """Filtering debit categories must not drop credit rows."""
    acc = accounts_mod.create(conn, "Main")
    food = categories_mod.create(conn, "Food")
    travel = categories_mod.create(conn, "Travel")

    # debit in food (kept), debit in travel (filtered out), credit (kept)
    _seed(
        conn,
        acc.id,
        date_str="2026-03-01",
        montant=-100,
        libelle="lunch",
        dedup="h1",
        category_id=food.id,
    )
    _seed(
        conn,
        acc.id,
        date_str="2026-03-02",
        montant=-200,
        libelle="train",
        dedup="h2",
        category_id=travel.id,
    )
    _seed(conn, acc.id, date_str="2026-03-03", montant=500, libelle="salary", dedup="h3")

    r = _call(
        conn,
        "bilan.summary",
        {"today": "2026-05-15", "debit_category_ids": [food.id]},
    )
    rows = r["result"]["rows"]
    by_type = {(row["type"], row["category_name"]): row["total_cents"] for row in rows}
    assert ("debit", "Food") in by_type
    assert ("debit", "Travel") not in by_type
    assert ("credit", None) in by_type  # uncategorized credit kept


def test_summary_include_no_category_debit(conn):
    acc = accounts_mod.create(conn, "Main")
    food = categories_mod.create(conn, "Food")
    _seed(
        conn,
        acc.id,
        date_str="2026-03-01",
        montant=-100,
        libelle="lunch",
        dedup="h1",
        category_id=food.id,
    )
    _seed(conn, acc.id, date_str="2026-03-02", montant=-200, libelle="orphan", dedup="h2")

    r = _call(
        conn,
        "bilan.summary",
        {
            "today": "2026-05-15",
            "debit_category_ids": [food.id],
            "include_no_category_debit": True,
        },
    )
    cats = {row["category_name"] for row in r["result"]["rows"]}
    assert cats == {"Food", None}


def test_filter_options_reflect_usage(conn):
    acc = accounts_mod.create(conn, "Main")
    food = categories_mod.create(conn, "Food")
    salary = categories_mod.create(conn, "Salary")
    unused = categories_mod.create(conn, "Unused")

    _seed(
        conn,
        acc.id,
        date_str="2026-03-01",
        montant=-100,
        libelle="lunch",
        dedup="h1",
        category_id=food.id,
    )
    _seed(
        conn,
        acc.id,
        date_str="2026-03-02",
        montant=2000,
        libelle="pay",
        dedup="h2",
        category_id=salary.id,
    )
    _seed(conn, acc.id, date_str="2026-03-03", montant=-50, libelle="orphan", dedup="h3")

    r = _call(conn, "bilan.filter_options")
    res = r["result"]
    debit_names = {c["name"] for c in res["debit_categories"]}
    credit_names = {c["name"] for c in res["credit_categories"]}
    assert debit_names == {"Food"}
    assert credit_names == {"Salary"}
    assert unused.name not in debit_names
    assert res["debit_has_uncategorized"] is True
    assert res["credit_has_uncategorized"] is False
    assert [a["name"] for a in res["accounts"]] == ["Main"]
