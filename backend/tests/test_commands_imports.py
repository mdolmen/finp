import json

from finp import accounts as accounts_mod
from finp import rpc


def _call(conn, method, params=None):
    body = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}
    return rpc._handle(conn, json.dumps(body))


def test_ingest_inserts_and_dedups(conn):
    acc = accounts_mod.create(conn, "Main")
    rows = [
        {"date": "2026-01-01", "montant_cents": -100, "libelle": "Café"},
        {"date": "2026-01-02", "montant_cents": -200, "libelle": "Boulangerie"},
        # duplicate of the first row → should be skipped
        {"date": "2026-01-01", "montant_cents": -100, "libelle": "Café"},
    ]
    r = _call(conn, "import.ingest", {"account_id": acc.id, "rows": rows})
    assert r["result"]["imported"] == 2
    assert r["result"]["skipped"] == 1
    assert r["result"]["rule_assigned"] == 0
    skipped = r["result"]["skipped_existing"]
    assert len(skipped) == 1
    assert skipped[0]["libelle"] == "Café"
    assert skipped[0]["montant_cents"] == -100


def test_ingest_triggers_rules(conn):
    acc = accounts_mod.create(conn, "Main")
    cat = _call(conn, "categories.create", {"name": "Food"})["result"]
    _call(
        conn,
        "rules.create",
        {
            "name": "cafe",
            "category_id": cat["id"],
            "predicate": {"kind": "libelle_contains", "text": "café"},
        },
    )
    rows = [
        {"date": "2026-01-01", "montant_cents": -100, "libelle": "Café"},
        {"date": "2026-01-02", "montant_cents": -200, "libelle": "Boulangerie"},
    ]
    r = _call(conn, "import.ingest", {"account_id": acc.id, "rows": rows})
    assert r["result"]["imported"] == 2
    assert r["result"]["rule_assigned"] == 1


def test_ingest_apply_rules_can_be_disabled(conn):
    acc = accounts_mod.create(conn, "Main")
    rows = [{"date": "2026-01-01", "montant_cents": -100, "libelle": "x"}]
    r = _call(
        conn,
        "import.ingest",
        {"account_id": acc.id, "rows": rows, "apply_rules": False},
    )
    assert r["result"]["rule_assigned"] == 0


def test_ingest_rejects_blank_libelle(conn):
    acc = accounts_mod.create(conn, "Main")
    rows = [{"date": "2026-01-01", "montant_cents": -100, "libelle": ""}]
    r = _call(conn, "import.ingest", {"account_id": acc.id, "rows": rows})
    assert r["error"]["code"] == -32602


def test_ingest_rejects_unknown_account(conn):
    rows = [{"date": "2026-01-01", "montant_cents": -100, "libelle": "x"}]
    r = _call(conn, "import.ingest", {"account_id": 999, "rows": rows})
    assert r["error"]["code"] == -32000
    assert r["error"]["data"]["code"] == "conflict"
