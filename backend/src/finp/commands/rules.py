"""``rules.*`` commands, including the bulk ``apply_now`` action."""

from __future__ import annotations

import sqlite3
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from finp import predicates, rules, rules_engine
from finp.commands._base import Command, EmptyParams


class LibelleContainsIn(BaseModel):
    kind: Literal["libelle_contains"]
    text: str = Field(min_length=1)
    case_sensitive: bool = False


class MontantCompareIn(BaseModel):
    kind: Literal["montant_compare"]
    operator: Literal[">", "<", "=="]
    value_cents: int


PredicateIn = Annotated[
    LibelleContainsIn | MontantCompareIn,
    Field(discriminator="kind"),
]


def _model_to_predicate(model: BaseModel) -> predicates.Predicate:
    return predicates.from_dict(model.model_dump())


class RuleOut(BaseModel):
    """Wire shape for a rule. ``predicate`` is the registry's dict form."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    category_id: int
    priority: int
    predicate: dict[str, Any]
    enabled: bool
    created_at: str

    @classmethod
    def from_rule(cls, rule: rules.Rule) -> RuleOut:
        return cls(
            id=rule.id,
            name=rule.name,
            category_id=rule.category_id,
            priority=rule.priority,
            predicate=rule.predicate.to_dict(),
            enabled=rule.enabled,
            created_at=rule.created_at,
        )


class IdParams(BaseModel):
    id: int


class ListParams(BaseModel):
    category_id: int | None = None


class CreateParams(BaseModel):
    name: str = Field(min_length=1)
    category_id: int
    predicate: PredicateIn
    enabled: bool = True
    priority: int | None = None


class UpdateParams(BaseModel):
    id: int
    name: str | None = None
    category_id: int | None = None
    predicate: PredicateIn | None = None
    enabled: bool | None = None


class ReorderParams(BaseModel):
    category_id: int
    rule_ids: list[int]


class ApplyResult(BaseModel):
    assigned: int


def _list(conn: sqlite3.Connection, params: ListParams) -> list[RuleOut]:
    return [RuleOut.from_rule(r) for r in rules.list_all(conn, category_id=params.category_id)]


def _get(conn: sqlite3.Connection, params: IdParams) -> RuleOut:
    return RuleOut.from_rule(rules.get(conn, params.id))


def _create(conn: sqlite3.Connection, params: CreateParams) -> RuleOut:
    rule = rules.create(
        conn,
        name=params.name,
        category_id=params.category_id,
        predicate=_model_to_predicate(params.predicate),
        enabled=params.enabled,
        priority=params.priority,
    )
    return RuleOut.from_rule(rule)


def _update(conn: sqlite3.Connection, params: UpdateParams) -> RuleOut:
    rule = rules.update(
        conn,
        params.id,
        name=params.name,
        category_id=params.category_id,
        predicate=_model_to_predicate(params.predicate) if params.predicate else None,
        enabled=params.enabled,
    )
    return RuleOut.from_rule(rule)


def _delete(conn: sqlite3.Connection, params: IdParams) -> None:
    rules.delete(conn, params.id)


def _reorder(conn: sqlite3.Connection, params: ReorderParams) -> None:
    rules.reorder_in_category(conn, params.category_id, params.rule_ids)


def _apply_now(conn: sqlite3.Connection, _: EmptyParams) -> ApplyResult:
    return ApplyResult(assigned=rules_engine.apply_rules_bulk(conn))


def _run(conn: sqlite3.Connection, params: IdParams) -> ApplyResult:
    return ApplyResult(assigned=rules_engine.apply_rule_to_uncategorized(conn, params.id))


METHODS: dict[str, Command] = {
    "rules.list": Command(ListParams, _list),
    "rules.get": Command(IdParams, _get),
    "rules.create": Command(CreateParams, _create),
    "rules.update": Command(UpdateParams, _update),
    "rules.delete": Command(IdParams, _delete),
    "rules.reorder_in_category": Command(ReorderParams, _reorder),
    "rules.apply_now": Command(EmptyParams, _apply_now),
    "rules.run": Command(IdParams, _run),
}
