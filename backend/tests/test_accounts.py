import pytest

from finp import accounts


def test_create_and_get(conn):
    a = accounts.create(conn, "Compte courant")
    assert a.name == "Compte courant"
    assert a.csv_mapping is None
    assert a.created_at

    fetched = accounts.get(conn, a.id)
    assert fetched == a


def test_get_missing_raises(conn):
    with pytest.raises(accounts.AccountNotFoundError):
        accounts.get(conn, 999)


def test_create_duplicate_name_raises(conn):
    import sqlite3

    accounts.create(conn, "Main")
    with pytest.raises(sqlite3.IntegrityError):
        accounts.create(conn, "Main")


def test_list_all_alphabetical(conn):
    accounts.create(conn, "Zebra")
    accounts.create(conn, "Alpha")
    accounts.create(conn, "Mike")

    names = [a.name for a in accounts.list_all(conn)]
    assert names == ["Alpha", "Mike", "Zebra"]


def test_rename(conn):
    a = accounts.create(conn, "Old")
    renamed = accounts.rename(conn, a.id, "New")
    assert renamed.name == "New"


def test_set_csv_mapping_round_trip(conn):
    a = accounts.create(conn, "Main")
    mapping = {"date": "Date opération", "montant": "Montant", "libelle": "Libellé"}
    accounts.set_csv_mapping(conn, a.id, mapping)

    fetched = accounts.get(conn, a.id)
    assert fetched.csv_mapping == mapping

    accounts.set_csv_mapping(conn, a.id, None)
    assert accounts.get(conn, a.id).csv_mapping is None


def test_delete(conn):
    a = accounts.create(conn, "Main")
    accounts.delete(conn, a.id)
    with pytest.raises(accounts.AccountNotFoundError):
        accounts.get(conn, a.id)
