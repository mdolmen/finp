import pytest

from finp import accounts, categories, events, operations, rules, rules_engine
from finp.predicates import LibelleContains, MontantCompare


@pytest.fixture
def acc(conn):
    return accounts.create(conn, "Main")


@pytest.fixture
def food(conn):
    return categories.create(conn, "Food")


@pytest.fixture
def big(conn):
    return categories.create(conn, "Big")


def _insert(conn, acc, libelle, montant=-100, date="2026-01-01"):
    return operations.insert(
        conn, account_id=acc.id, date=date, montant_cents=montant, libelle=libelle
    )


def test_first_match_wins_by_global_order(conn, acc, food, big):
    rules.create(conn, name="big-amount", category_id=big.id, predicate=MontantCompare("<", -1000))
    rules.create(conn, name="cafe", category_id=food.id, predicate=LibelleContains(text="café"))
    op = _insert(conn, acc, "Café luxueux", montant=-2000)

    out = rules_engine.apply_rules(conn, op)
    # "Big" sorts before "Food" alphabetically — first match wins.
    assert out.category_id == big.id


def test_does_not_overwrite_manual_category(conn, acc, food, big):
    rules.create(conn, name="cafe", category_id=big.id, predicate=LibelleContains(text="café"))
    op = _insert(conn, acc, "Café")
    operations.assign_category(conn, op.id, food.id)

    out = rules_engine.apply_rules(conn, operations.get(conn, op.id))
    assert out.category_id == food.id


def test_no_match_leaves_op_uncategorized(conn, acc, food):
    rules.create(conn, name="taxi", category_id=food.id, predicate=LibelleContains(text="taxi"))
    op = _insert(conn, acc, "Boulangerie")
    out = rules_engine.apply_rules(conn, op)
    assert out.category_id is None


def test_disabled_rules_skipped(conn, acc, food, big):
    big_rule = rules.create(conn, name="any", category_id=big.id, predicate=MontantCompare("<", 0))
    rules.update(conn, big_rule.id, enabled=False)
    rules.create(conn, name="cafe", category_id=food.id, predicate=LibelleContains(text="café"))
    op = _insert(conn, acc, "Café")
    out = rules_engine.apply_rules(conn, op)
    assert out.category_id == food.id


def test_apply_bulk_categorizes_only_uncategorized(conn, acc, food):
    rules.create(conn, name="cafe", category_id=food.id, predicate=LibelleContains(text="café"))
    op_a = _insert(conn, acc, "Café A", date="2026-01-01")
    op_b = _insert(conn, acc, "Café B", date="2026-01-02")
    other_cat = categories.create(conn, "Manual")
    operations.assign_category(conn, op_b.id, other_cat.id)

    count = rules_engine.apply_rules_bulk(conn)
    assert count == 1
    assert operations.get(conn, op_a.id).category_id == food.id
    assert operations.get(conn, op_b.id).category_id == other_cat.id


def test_emits_rule_matched_event(conn, acc, food):
    rule = rules.create(
        conn, name="cafe", category_id=food.id, predicate=LibelleContains(text="café")
    )
    op = _insert(conn, acc, "Café")

    received = []
    events.bus.clear()
    events.bus.subscribe(events.RULE_MATCHED, received.append)
    try:
        rules_engine.apply_rules(conn, op)
    finally:
        events.bus.clear()

    assert received == [{"rule_id": rule.id, "operation_id": op.id, "category_id": food.id}]


def test_priority_within_category(conn, acc, food):
    """Within a single category, lower priority number wins."""
    rules.create(
        conn,
        name="generic",
        category_id=food.id,
        predicate=LibelleContains(text="o"),
    )
    rules.create(
        conn,
        name="specific",
        category_id=food.id,
        predicate=LibelleContains(text="café"),
    )
    op = _insert(conn, acc, "Café")
    out = rules_engine.apply_rules(conn, op)
    # both rules match; the first one ('generic', priority 0) wins
    assert out.category_id == food.id
