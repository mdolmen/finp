import json

from finp import accounts as accounts_mod
from finp import operations as operations_mod
from finp import rpc


def _call(conn, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def _make_category(conn, name):
    return _call(conn, "categories.create", {"name": name})["result"]


def test_create_with_libelle_predicate(conn):
    cat = _make_category(conn, "Food")
    r = _call(
        conn,
        "rules.create",
        {
            "name": "cafe",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "café"},
        },
    )
    assert r["result"]["name"] == "cafe"
    assert r["result"]["predicate"] == {
        "kind": "libelle_contains",
        "text": "café",
        "case_sensitive": False,
    }
    assert r["result"]["priority"] == 0


def test_create_with_montant_predicate(conn):
    cat = _make_category(conn, "Big")
    r = _call(
        conn,
        "rules.create",
        {
            "name": "big-out",
            "category_id": cat["id"],
            "predicate": {"kind": "montant_compare", "operator": "<", "value_cents": -10000},
        },
    )
    assert r["result"]["predicate"]["operator"] == "<"


def test_invalid_predicate_kind_rejected(conn):
    cat = _make_category(conn, "X")
    r = _call(
        conn,
        "rules.create",
        {
            "name": "x",
            "category_id": cat["id"],
            "predicate": {"kind": "unknown", "foo": "bar"},
        },
    )
    assert r["error"]["code"] == -32602


def test_invalid_montant_operator_rejected(conn):
    cat = _make_category(conn, "X")
    r = _call(
        conn,
        "rules.create",
        {
            "name": "x",
            "category_id": cat["id"],
            "predicate": {"kind": "montant_compare", "operator": "<>", "value_cents": 0},
        },
    )
    assert r["error"]["code"] == -32602


def test_update_partial(conn):
    cat = _make_category(conn, "Food")
    r = _call(
        conn,
        "rules.create",
        {
            "name": "orig",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "x"},
        },
    )
    rule = r["result"]
    r = _call(conn, "rules.update", {"id": rule["id"], "name": "renamed", "enabled": False})
    assert r["result"]["name"] == "renamed"
    assert r["result"]["enabled"] is False


def test_reorder(conn):
    cat = _make_category(conn, "Food")
    a = _call(
        conn,
        "rules.create",
        {
            "name": "a",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "a"},
        },
    )["result"]
    b = _call(
        conn,
        "rules.create",
        {
            "name": "b",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "b"},
        },
    )["result"]

    r = _call(
        conn,
        "rules.reorder_in_category",
        {"category_id": cat["id"], "rule_ids": [b["id"], a["id"]]},
    )
    assert "error" not in r

    listed = _call(conn, "rules.list", {"category_id": cat["id"]})["result"]
    assert [x["name"] for x in listed] == ["b", "a"]


def test_apply_now_categorizes_uncategorized(conn):
    cat = _make_category(conn, "Food")
    _call(
        conn,
        "rules.create",
        {
            "name": "cafe",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "café"},
        },
    )

    acc = accounts_mod.create(conn, "Main")
    operations_mod.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-200, libelle="Café"
    )
    operations_mod.insert(
        conn, account_id=acc.id, date="2026-01-02", montant_cents=-300, libelle="Boulangerie"
    )

    r = _call(conn, "rules.apply_now")
    assert r["result"] == {"assigned": 1}


def test_delete(conn):
    cat = _make_category(conn, "Food")
    rule = _call(
        conn,
        "rules.create",
        {
            "name": "x",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "x"},
        },
    )["result"]
    _call(conn, "rules.delete", {"id": rule["id"]})
    r = _call(conn, "rules.get", {"id": rule["id"]})
    assert r["error"]["data"]["code"] == "rule.not_found"
