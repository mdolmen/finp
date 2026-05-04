import sqlite3

import pytest

from finp import accounts, categories


def _add_op(conn, account_id, category_id, libelle="x", amount=-100, dedup="h"):
    conn.execute(
        "INSERT INTO operations(account_id, date, montant_cents, libelle, type,"
        " category_id, dedup_hash) VALUES (?, '2026-01-01', ?, ?, 'debit', ?, ?)",
        (account_id, amount, libelle, category_id, dedup),
    )


def test_builtin_seeded(conn):
    cat = categories.get_builtin_internal_transfer(conn)
    assert cat.name == "Virement interne"
    assert cat.is_builtin is True


def test_create_and_list_alphabetical(conn):
    categories.create(conn, "Voyage")
    categories.create(conn, "Alimentation")

    names = [c.name for c in categories.list_all(conn)]
    assert names == ["Alimentation", "Virement interne", "Voyage"]


def test_create_duplicate_name_raises(conn):
    categories.create(conn, "Food")
    with pytest.raises(sqlite3.IntegrityError):
        categories.create(conn, "Food")


def test_rename_builtin_blocked(conn):
    cat = categories.get_builtin_internal_transfer(conn)
    with pytest.raises(categories.BuiltinCategoryError):
        categories.rename(conn, cat.id, "Other")


def test_delete_builtin_blocked(conn):
    cat = categories.get_builtin_internal_transfer(conn)
    with pytest.raises(categories.BuiltinCategoryError):
        categories.delete(conn, cat.id)


def test_delete_unreferenced(conn):
    cat = categories.create(conn, "Tmp")
    categories.delete(conn, cat.id)
    with pytest.raises(categories.CategoryNotFoundError):
        categories.get(conn, cat.id)


def test_delete_referenced_blocked(conn):
    cat = categories.create(conn, "Food")
    acc = accounts.create(conn, "Main")
    _add_op(conn, acc.id, cat.id, dedup="h1")

    with pytest.raises(categories.CategoryInUseError):
        categories.delete(conn, cat.id)


def test_reassign_then_delete(conn):
    food = categories.create(conn, "Food")
    groceries = categories.create(conn, "Groceries")
    acc = accounts.create(conn, "Main")
    _add_op(conn, acc.id, food.id, dedup="h1")
    _add_op(conn, acc.id, food.id, dedup="h2")

    moved = categories.reassign_operations(conn, food.id, groceries.id)
    assert moved == 2

    categories.delete(conn, food.id)

    rows = conn.execute(
        "SELECT category_id FROM operations WHERE category_id = ?", (groceries.id,)
    ).fetchall()
    assert len(rows) == 2


def test_reassign_to_none_clears_category(conn):
    food = categories.create(conn, "Food")
    acc = accounts.create(conn, "Main")
    _add_op(conn, acc.id, food.id, dedup="h1")

    categories.reassign_operations(conn, food.id, None)
    categories.delete(conn, food.id)

    row = conn.execute("SELECT category_id FROM operations").fetchone()
    assert row["category_id"] is None
