import json

import pytest

from finp import accounts as accounts_mod
from finp import categories as categories_mod
from finp import rpc


def _call(conn, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


@pytest.fixture
def acc(conn):
    return accounts_mod.create(conn, "Main")


def test_insert_returns_op(conn, acc):
    r = _call(
        conn,
        "operations.insert",
        {"account_id": acc.id, "date": "2026-01-01", "montant_cents": -500, "libelle": "Café"},
    )
    op = r["result"]
    assert op["type"] == "debit"
    assert op["category_id"] is None


def test_insert_dedup_returns_null(conn, acc):
    payload = {
        "account_id": acc.id,
        "date": "2026-01-01",
        "montant_cents": -100,
        "libelle": "X",
    }
    _call(conn, "operations.insert", payload)
    r = _call(conn, "operations.insert", payload)
    assert r["result"] is None


def test_assign_virement_interne_flips_to_internal(conn, acc):
    op = _call(
        conn,
        "operations.insert",
        {"account_id": acc.id, "date": "2026-01-01", "montant_cents": -500, "libelle": "T"},
    )["result"]
    internal = categories_mod.get_builtin_internal_transfer(conn)

    r = _call(conn, "operations.assign_category", {"id": op["id"], "category_id": internal.id})
    assert r["result"]["type"] == "internal"


def test_list_filters_round_trip(conn, acc):
    for date, libelle, montant in [
        ("2026-01-01", "Café", -100),
        ("2026-02-01", "Salaire", 1000),
        ("2026-02-15", "Boulangerie", -300),
    ]:
        _call(
            conn,
            "operations.insert",
            {
                "account_id": acc.id,
                "date": date,
                "montant_cents": montant,
                "libelle": libelle,
            },
        )

    r = _call(conn, "operations.list", {"types": ["credit"]})
    assert [o["libelle"] for o in r["result"]["items"]] == ["Salaire"]

    r = _call(
        conn,
        "operations.list",
        {"date_from": "2026-02-01", "date_to": "2026-02-28"},
    )
    assert {o["libelle"] for o in r["result"]["items"]} == {"Salaire", "Boulangerie"}

    r = _call(conn, "operations.list", {"search": "café"})
    assert [o["libelle"] for o in r["result"]["items"]] == ["Café"]


def test_bulk_assign(conn, acc):
    food = _call(conn, "categories.create", {"name": "Food"})["result"]
    ids = []
    for date in ("2026-01-01", "2026-01-02", "2026-01-03"):
        op = _call(
            conn,
            "operations.insert",
            {
                "account_id": acc.id,
                "date": date,
                "montant_cents": -100,
                "libelle": f"x{date}",
            },
        )["result"]
        ids.append(op["id"])

    r = _call(conn, "operations.bulk_assign_category", {"ids": ids, "category_id": food["id"]})
    assert r["result"] == {"updated": 3}

    r = _call(conn, "operations.list", {"category_ids": [food["id"]]})
    assert len(r["result"]["items"]) == 3
