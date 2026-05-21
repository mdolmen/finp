from finp.db import connect, migrate


def test_migrate_creates_schema_and_seeds_builtin():
    conn = connect(":memory:")
    applied = migrate(conn)

    assert applied == [
        "0001_initial.sql",
        "0002_planned_operations.sql",
        "0003_account_initial_balance.sql",
        "0004_category_recurring.sql",
        "0005_tink.sql",
        "0006_tink_credentials_id.sql",
        "0007_operation_recurring.sql",
        "0008_operation_recurring_type.sql",
        "0009_operation_balance.sql",
        "0010_gocardless.sql",
        "0011_automations.sql",
    ]

    tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {"accounts", "categories", "operations", "rules", "schema_migrations"} <= tables

    row = conn.execute(
        "SELECT name, is_builtin FROM categories WHERE name = 'Virement interne'"
    ).fetchone()
    assert row is not None
    assert row["is_builtin"] == 1


def test_migrate_is_idempotent():
    conn = connect(":memory:")
    migrate(conn)
    second = migrate(conn)
    assert second == []


def test_foreign_keys_enforced():
    import sqlite3

    conn = connect(":memory:")
    migrate(conn)

    try:
        conn.execute(
            "INSERT INTO operations(account_id, date, montant_cents, libelle, type, dedup_hash)"
            " VALUES (999, '2026-01-01', -100, 'x', 'debit', 'h')"
        )
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("expected FK violation")


def test_fts_triggers_index_libelle():
    conn = connect(":memory:")
    migrate(conn)

    conn.execute("INSERT INTO accounts(name) VALUES ('main')")
    conn.execute(
        "INSERT INTO operations(account_id, date, montant_cents, libelle, type, dedup_hash)"
        " VALUES (1, '2026-01-01', -1234, 'Café du matin', 'debit', 'h1')"
    )

    rows = conn.execute(
        "SELECT rowid FROM operations_fts WHERE operations_fts MATCH 'cafe'"
    ).fetchall()
    assert len(rows) == 1
