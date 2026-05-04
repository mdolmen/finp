from dataclasses import dataclass

import pytest

from finp.predicates import LibelleContains, MontantCompare, from_dict


@dataclass
class FakeOp:
    libelle: str
    montant_cents: int


def test_libelle_contains_case_insensitive_default():
    p = LibelleContains(text="Café")
    assert p.matches(FakeOp("Le CAFÉ du coin", 0))
    assert not p.matches(FakeOp("Boulangerie", 0))


def test_libelle_contains_case_sensitive():
    p = LibelleContains(text="Café", case_sensitive=True)
    assert p.matches(FakeOp("Café du matin", 0))
    assert not p.matches(FakeOp("CAFÉ", 0))


def test_montant_compare_operators():
    op = FakeOp("x", -500)
    assert MontantCompare(operator="<", value_cents=0).matches(op)
    assert MontantCompare(operator=">", value_cents=-1000).matches(op)
    assert MontantCompare(operator="==", value_cents=-500).matches(op)
    assert not MontantCompare(operator=">", value_cents=0).matches(op)


def test_montant_compare_rejects_unknown_operator():
    with pytest.raises(ValueError):
        MontantCompare(operator="<>", value_cents=0)


def test_round_trip_libelle():
    p = LibelleContains(text="abc", case_sensitive=True)
    assert from_dict(p.to_dict()) == p


def test_round_trip_montant():
    p = MontantCompare(operator=">", value_cents=10000)
    assert from_dict(p.to_dict()) == p


def test_from_dict_unknown_kind_raises():
    with pytest.raises(ValueError):
        from_dict({"kind": "nope"})
