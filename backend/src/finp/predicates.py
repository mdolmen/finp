"""Rule predicates: composable, JSON-serializable matchers.

Adding a new predicate kind = one new dataclass + one ``REGISTRY`` entry.
Predicates take a duck-typed object exposing ``libelle: str`` and
``montant_cents: int`` (so we don't import ``Operation`` and form a cycle).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, ClassVar, Protocol, runtime_checkable


@runtime_checkable
class _OpLike(Protocol):
    libelle: str
    montant_cents: int


class Predicate(Protocol):
    """Match predicates against operation-shaped values."""

    kind: ClassVar[str]

    def matches(self, op: _OpLike) -> bool: ...

    def to_dict(self) -> dict[str, Any]: ...


@dataclass(frozen=True, slots=True)
class LibelleContains:
    """True when ``text`` appears in the operation's ``libelle``."""

    text: str
    case_sensitive: bool = False
    kind: ClassVar[str] = "libelle_contains"

    def matches(self, op: _OpLike) -> bool:
        if self.case_sensitive:
            return self.text in op.libelle
        return self.text.casefold() in op.libelle.casefold()

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "text": self.text, "case_sensitive": self.case_sensitive}


@dataclass(frozen=True, slots=True)
class MontantCompare:
    """Compare ``montant_cents`` to ``value_cents`` using one of ``>``, ``<``, ``==``."""

    operator: str
    value_cents: int
    kind: ClassVar[str] = "montant_compare"

    _OPS: ClassVar[dict[str, str]] = {">": ">", "<": "<", "==": "=="}

    def __post_init__(self) -> None:
        if self.operator not in self._OPS:
            raise ValueError(f"unsupported operator: {self.operator!r}")

    def matches(self, op: _OpLike) -> bool:
        m = op.montant_cents
        v = self.value_cents
        if self.operator == ">":
            return m > v
        if self.operator == "<":
            return m < v
        return m == v

    def to_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "operator": self.operator, "value_cents": self.value_cents}


REGISTRY: dict[str, type[Predicate]] = {
    LibelleContains.kind: LibelleContains,
    MontantCompare.kind: MontantCompare,
}


def from_dict(data: dict[str, Any]) -> Predicate:
    """Reconstruct a predicate from its serialized form."""
    kind = data.get("kind")
    if not isinstance(kind, str) or kind not in REGISTRY:
        raise ValueError(f"unknown predicate kind: {kind!r}")
    cls = REGISTRY[kind]
    return cls(**{k: v for k, v in data.items() if k != "kind"})
