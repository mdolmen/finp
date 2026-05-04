import json

from finp import rpc


def _call(conn, method, params=None, req_id=1):
    body = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def test_create_then_list(conn):
    r = _call(conn, "accounts.create", {"name": "Main"})
    assert r["result"]["name"] == "Main"
    assert r["result"]["csv_mapping"] is None

    r = _call(conn, "accounts.list")
    assert [a["name"] for a in r["result"]] == ["Main"]


def test_create_blank_name_rejected(conn):
    r = _call(conn, "accounts.create", {"name": ""})
    assert r["error"]["code"] == -32602


def test_duplicate_name_returns_conflict(conn):
    _call(conn, "accounts.create", {"name": "Main"})
    r = _call(conn, "accounts.create", {"name": "Main"})
    assert r["error"]["code"] == -32000
    assert r["error"]["data"]["code"] == "conflict"


def test_get_missing_returns_not_found(conn):
    r = _call(conn, "accounts.get", {"id": 999})
    assert r["error"]["data"]["code"] == "account.not_found"


def test_set_csv_mapping_round_trip(conn):
    a = _call(conn, "accounts.create", {"name": "Main"})["result"]
    mapping = {"date": "Date opération", "montant": "Montant"}
    _call(conn, "accounts.set_csv_mapping", {"id": a["id"], "mapping": mapping})
    fetched = _call(conn, "accounts.get", {"id": a["id"]})["result"]
    assert fetched["csv_mapping"] == mapping


def test_rename_and_delete(conn):
    a = _call(conn, "accounts.create", {"name": "Old"})["result"]
    r = _call(conn, "accounts.rename", {"id": a["id"], "name": "New"})
    assert r["result"]["name"] == "New"
    _call(conn, "accounts.delete", {"id": a["id"]})
    r = _call(conn, "accounts.get", {"id": a["id"]})
    assert r["error"]["data"]["code"] == "account.not_found"
