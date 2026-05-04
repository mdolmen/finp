"""Application-level errors and the mapping to JSON-RPC responses.

The RPC layer catches domain exceptions and translates them into a stable
``{code, message, data?}`` envelope so the frontend can render them as
toasts without knowing Python exception types.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import Any

from finp import accounts, categories, rules


@dataclass(frozen=True, slots=True)
class AppError(Exception):
    """A user-visible application error with a stable string code."""

    code: str
    message: str
    data: dict[str, Any] | None = None

    def __str__(self) -> str:
        return f"{self.code}: {self.message}"


def to_app_error(exc: Exception) -> AppError | None:
    """Map a known domain exception to ``AppError``. Returns ``None`` if unknown."""
    if isinstance(exc, AppError):
        return exc
    if isinstance(exc, accounts.AccountNotFoundError):
        return AppError("account.not_found", str(exc))
    if isinstance(exc, categories.CategoryNotFoundError):
        return AppError("category.not_found", str(exc))
    if isinstance(exc, categories.CategoryInUseError):
        return AppError("category.in_use", str(exc))
    if isinstance(exc, categories.BuiltinCategoryError):
        return AppError("category.builtin", str(exc))
    if isinstance(exc, rules.RuleNotFoundError):
        return AppError("rule.not_found", str(exc))
    if isinstance(exc, sqlite3.IntegrityError):
        return AppError("conflict", str(exc))
    if isinstance(exc, ValueError):
        return AppError("invalid_argument", str(exc))
    if isinstance(exc, LookupError):
        return AppError("not_found", str(exc))
    return None
