import json

from finp import accounts as accounts_mod
from finp import operations, rpc


def _call(conn, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def test_list_includes_seeded_builtin(conn):
    r = _call(conn, "categories.list")
    names = [c["name"] for c in r["result"]]
    assert "Virement interne" in names
    builtin = next(c for c in r["result"] if c["name"] == "Virement interne")
    assert builtin["is_builtin"] is True


def test_create_then_appears(conn):
    r = _call(conn, "categories.create", {"name": "Food"})
    assert r["result"]["name"] == "Food"
    assert r["result"]["is_builtin"] is False


def test_rename_builtin_is_blocked(conn):
    builtin_id = next(
        c["id"] for c in _call(conn, "categories.list")["result"] if c["name"] == "Virement interne"
    )
    r = _call(conn, "categories.rename", {"id": builtin_id, "name": "Other"})
    assert r["error"]["data"]["code"] == "category.builtin"


def test_delete_referenced_returns_in_use(conn):
    cat = _call(conn, "categories.create", {"name": "Food"})["result"]
    acc = accounts_mod.create(conn, "Main")
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="x"
    )
    operations.assign_category(conn, op.id, cat["id"])

    r = _call(conn, "categories.delete", {"id": cat["id"]})
    assert r["error"]["data"]["code"] == "category.in_use"


def test_reassign_operations(conn):
    food = _call(conn, "categories.create", {"name": "Food"})["result"]
    groc = _call(conn, "categories.create", {"name": "Groceries"})["result"]
    acc = accounts_mod.create(conn, "Main")
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="x"
    )
    operations.assign_category(conn, op.id, food["id"])

    r = _call(conn, "categories.reassign_operations", {"from_id": food["id"], "to_id": groc["id"]})
    assert r["result"] == {"moved": 1}
