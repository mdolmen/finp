import pytest

from finp import accounts, categories, events, operations


@pytest.fixture
def acc(conn):
    return accounts.create(conn, "Main")


def test_insert_derives_debit(conn, acc):
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-15", montant_cents=-1234, libelle="Café"
    )
    assert op is not None
    assert op.type == "debit"
    assert op.category_id is None


def test_insert_derives_credit(conn, acc):
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-15", montant_cents=5000, libelle="Salaire"
    )
    assert op is not None
    assert op.type == "credit"


def test_insert_dedup_silently_skips(conn, acc):
    op1 = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="X"
    )
    op2 = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="X"
    )
    assert op1 is not None
    assert op2 is None

    rows = conn.execute("SELECT COUNT(*) FROM operations").fetchone()[0]
    assert rows == 1


def test_insert_publishes_created_event(conn, acc):
    received = []
    events.bus.clear()
    events.bus.subscribe(events.OPERATION_CREATED, received.append)
    try:
        operations.insert(
            conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="X"
        )
    finally:
        events.bus.clear()

    assert len(received) == 1
    assert received[0]["account_id"] == acc.id


def test_assign_virement_interne_flips_to_internal(conn, acc):
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-500, libelle="Transfer"
    )
    internal = categories.get_builtin_internal_transfer(conn)

    updated = operations.assign_category(conn, op.id, internal.id)
    assert updated.type == "internal"
    assert updated.category_id == internal.id


def test_clearing_category_reverts_type(conn, acc):
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-500, libelle="Transfer"
    )
    internal = categories.get_builtin_internal_transfer(conn)
    operations.assign_category(conn, op.id, internal.id)

    cleared = operations.assign_category(conn, op.id, None)
    assert cleared.type == "debit"
    assert cleared.category_id is None


def test_assigning_other_category_keeps_debit(conn, acc):
    food = categories.create(conn, "Food")
    op = operations.insert(
        conn, account_id=acc.id, date="2026-01-01", montant_cents=-500, libelle="Lunch"
    )
    updated = operations.assign_category(conn, op.id, food.id)
    assert updated.type == "debit"
    assert updated.category_id == food.id


def test_list_filters(conn, acc):
    food = categories.create(conn, "Food")
    operations.insert(conn, account_id=acc.id, date="2026-01-01", montant_cents=-100, libelle="A")
    op_b = operations.insert(
        conn, account_id=acc.id, date="2026-02-01", montant_cents=-200, libelle="B"
    )
    operations.insert(conn, account_id=acc.id, date="2026-03-01", montant_cents=300, libelle="C")
    operations.assign_category(conn, op_b.id, food.id)

    debits = operations.list_(conn, types=["debit"])
    assert [o.libelle for o in debits] == ["B", "A"]

    in_food = operations.list_(conn, category_ids=[food.id])
    assert [o.libelle for o in in_food] == ["B"]

    uncategorized_or_food = operations.list_(conn, category_ids=[food.id], include_no_category=True)
    assert {o.libelle for o in uncategorized_or_food} == {"A", "B", "C"}

    by_date = operations.list_(conn, date_from="2026-02-01", date_to="2026-02-28")
    assert [o.libelle for o in by_date] == ["B"]


def test_search_uses_fts(conn, acc):
    operations.insert(
        conn,
        account_id=acc.id,
        date="2026-01-01",
        montant_cents=-200,
        libelle="Café du matin",
    )
    operations.insert(
        conn,
        account_id=acc.id,
        date="2026-01-02",
        montant_cents=-300,
        libelle="Boulangerie",
    )

    hits = operations.list_(conn, search_terms=["cafe"])
    assert [o.libelle for o in hits] == ["Café du matin"]

    prefix = operations.list_(conn, search_terms=["boul"])
    assert [o.libelle for o in prefix] == ["Boulangerie"]


def test_search_terms_combinators(conn, acc):
    for libelle in ("Café Paris", "Café Boulanger", "Boulanger Tour", "Tour Eiffel"):
        operations.insert(
            conn,
            account_id=acc.id,
            date="2026-01-01",
            montant_cents=-100,
            libelle=libelle,
        )

    and_hits = operations.list_(conn, search_terms=["cafe", "boul"], search_combinator="AND")
    assert {o.libelle for o in and_hits} == {"Café Boulanger"}

    or_hits = operations.list_(conn, search_terms=["cafe", "boul"], search_combinator="OR")
    assert {o.libelle for o in or_hits} == {"Café Paris", "Café Boulanger", "Boulanger Tour"}

    xor_hits = operations.list_(conn, search_terms=["cafe", "boul"], search_combinator="XOR")
    assert {o.libelle for o in xor_hits} == {"Café Paris", "Boulanger Tour"}


def test_search_terms_substring(conn, acc):
    operations.insert(
        conn,
        account_id=acc.id,
        date="2026-01-01",
        montant_cents=-100,
        libelle="Carrefour Carbone",
    )
    operations.insert(
        conn,
        account_id=acc.id,
        date="2026-01-02",
        montant_cents=-100,
        libelle="Boulangerie",
    )

    hits = operations.list_(conn, search_terms=["*arbon*"])
    assert [o.libelle for o in hits] == ["Carrefour Carbone"]


def test_list_pagination(conn, acc):
    for i in range(5):
        operations.insert(
            conn,
            account_id=acc.id,
            date=f"2026-01-0{i + 1}",
            montant_cents=-100 - i,
            libelle=f"op{i}",
        )

    page1 = operations.list_(conn, limit=2, offset=0)
    page2 = operations.list_(conn, limit=2, offset=2)
    assert [o.libelle for o in page1] == ["op4", "op3"]
    assert [o.libelle for o in page2] == ["op2", "op1"]
