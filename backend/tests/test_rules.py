import pytest

from finp import categories, rules
from finp.predicates import LibelleContains, MontantCompare


@pytest.fixture
def food(conn):
    return categories.create(conn, "Food")


@pytest.fixture
def travel(conn):
    return categories.create(conn, "Travel")


def test_create_assigns_next_priority_per_category(conn, food, travel):
    r1 = rules.create(conn, name="r1", category_id=food.id, predicate=LibelleContains(text="x"))
    r2 = rules.create(conn, name="r2", category_id=food.id, predicate=LibelleContains(text="y"))
    r3 = rules.create(conn, name="r3", category_id=travel.id, predicate=LibelleContains(text="z"))

    assert r1.priority == 0
    assert r2.priority == 1
    assert r3.priority == 0


def test_round_trip_predicate(conn, food):
    p = MontantCompare(operator=">", value_cents=1000)
    r = rules.create(conn, name="big", category_id=food.id, predicate=p)
    fetched = rules.get(conn, r.id)
    assert fetched.predicate == p


def test_list_all_grouped_by_category_then_priority(conn, food, travel):
    rules.create(conn, name="t1", category_id=travel.id, predicate=LibelleContains(text="a"))
    rules.create(conn, name="f1", category_id=food.id, predicate=LibelleContains(text="b"))
    rules.create(conn, name="f2", category_id=food.id, predicate=LibelleContains(text="c"))

    names = [r.name for r in rules.list_all(conn)]
    assert names == ["f1", "f2", "t1"]


def test_update_partial(conn, food):
    r = rules.create(conn, name="orig", category_id=food.id, predicate=LibelleContains(text="x"))
    updated = rules.update(conn, r.id, name="renamed", enabled=False)
    assert updated.name == "renamed"
    assert updated.enabled is False
    assert updated.predicate == r.predicate


def test_update_moves_to_new_category_appends_priority(conn, food, travel):
    rules.create(conn, name="t0", category_id=travel.id, predicate=LibelleContains(text="x"))
    moving = rules.create(conn, name="m", category_id=food.id, predicate=LibelleContains(text="y"))

    moved = rules.update(conn, moving.id, category_id=travel.id)
    assert moved.category_id == travel.id
    assert moved.priority == 1


def test_delete(conn, food):
    r = rules.create(conn, name="r", category_id=food.id, predicate=LibelleContains(text="x"))
    rules.delete(conn, r.id)
    with pytest.raises(rules.RuleNotFoundError):
        rules.get(conn, r.id)


def test_reorder_in_category(conn, food):
    a = rules.create(conn, name="a", category_id=food.id, predicate=LibelleContains(text="a"))
    b = rules.create(conn, name="b", category_id=food.id, predicate=LibelleContains(text="b"))
    c = rules.create(conn, name="c", category_id=food.id, predicate=LibelleContains(text="c"))

    rules.reorder_in_category(conn, food.id, [c.id, a.id, b.id])

    ordered = [r.name for r in rules.list_all(conn, category_id=food.id)]
    assert ordered == ["c", "a", "b"]


def test_reorder_rejects_mismatched_ids(conn, food):
    a = rules.create(conn, name="a", category_id=food.id, predicate=LibelleContains(text="a"))
    with pytest.raises(ValueError):
        rules.reorder_in_category(conn, food.id, [a.id, 9999])


def test_deleting_category_cascades_to_rules(conn, food):
    rules.create(conn, name="r", category_id=food.id, predicate=LibelleContains(text="x"))
    # categories.delete refuses if operations reference it; rules don't block it.
    categories.delete(conn, food.id)
    assert rules.list_all(conn) == []
