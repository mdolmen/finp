"""Categories: flat user-defined list, plus the built-in ``Virement interne``.

The built-in cannot be renamed or deleted — assigning it to an operation is
what flips that operation's type to ``internal`` (handled in ``operations``).
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass

BUILTIN_INTERNAL_TRANSFER = "Virement interne"


class CategoryNotFoundError(LookupError):
    """Raised when a category id has no row in the database."""


class CategoryInUseError(RuntimeError):
    """Raised when deleting a category that still has operations referencing it."""


class BuiltinCategoryError(RuntimeError):
    """Raised when attempting to rename or delete the built-in category."""


@dataclass(frozen=True, slots=True)
class Category:
    """A label users can assign to operations."""

    id: int
    name: str
    is_builtin: bool
    display_order: int


def _row_to_category(row: sqlite3.Row) -> Category:
    return Category(
        id=row["id"],
        name=row["name"],
        is_builtin=bool(row["is_builtin"]),
        display_order=row["display_order"],
    )


def create(conn: sqlite3.Connection, name: str) -> Category:
    """Create a non-built-in category. ``name`` must be unique."""
    cur = conn.execute(
        "INSERT INTO categories (name, is_builtin, display_order) VALUES (?, 0, 0)",
        (name,),
    )
    return get(conn, cur.lastrowid)


def get(conn: sqlite3.Connection, category_id: int) -> Category:
    """Fetch a category by id. Raises ``CategoryNotFoundError`` if missing."""
    row = conn.execute(
        "SELECT id, name, is_builtin, display_order FROM categories WHERE id = ?",
        (category_id,),
    ).fetchone()
    if row is None:
        raise CategoryNotFoundError(f"category id={category_id}")
    return _row_to_category(row)


def get_by_name(conn: sqlite3.Connection, name: str) -> Category | None:
    """Look up a category by exact name. Returns ``None`` if not found."""
    row = conn.execute(
        "SELECT id, name, is_builtin, display_order FROM categories WHERE name = ?",
        (name,),
    ).fetchone()
    return _row_to_category(row) if row else None


def list_all(conn: sqlite3.Connection) -> list[Category]:
    """Return all categories ordered alphabetically (case-insensitive)."""
    rows = conn.execute(
        "SELECT id, name, is_builtin, display_order FROM categories ORDER BY name COLLATE NOCASE"
    ).fetchall()
    return [_row_to_category(r) for r in rows]


def rename(conn: sqlite3.Connection, category_id: int, new_name: str) -> Category:
    """Rename a category. Built-in categories cannot be renamed."""
    cat = get(conn, category_id)
    if cat.is_builtin:
        raise BuiltinCategoryError(f"cannot rename built-in category {cat.name!r}")
    conn.execute("UPDATE categories SET name = ? WHERE id = ?", (new_name, category_id))
    return get(conn, category_id)


def delete(conn: sqlite3.Connection, category_id: int) -> None:
    """Delete a category. Refuses if any operation still references it.

    Built-in categories cannot be deleted. To delete a referenced category,
    call ``reassign_operations`` first.
    """
    cat = get(conn, category_id)
    if cat.is_builtin:
        raise BuiltinCategoryError(f"cannot delete built-in category {cat.name!r}")

    refcount = conn.execute(
        "SELECT COUNT(*) FROM operations WHERE category_id = ?", (category_id,)
    ).fetchone()[0]
    if refcount > 0:
        raise CategoryInUseError(f"category id={category_id} has {refcount} operation(s)")

    conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))


def reassign_operations(
    conn: sqlite3.Connection,
    from_id: int,
    to_id: int | None,
) -> int:
    """Move every operation referencing ``from_id`` to ``to_id`` (or clear it).

    Returns the number of rows affected. This bypasses the "Virement interne"
    type-flip logic — callers handle that via ``operations.assign_category``
    when the target is the built-in.
    """
    get(conn, from_id)
    if to_id is not None:
        get(conn, to_id)
    cur = conn.execute(
        "UPDATE operations SET category_id = ? WHERE category_id = ?",
        (to_id, from_id),
    )
    return cur.rowcount


def get_builtin_internal_transfer(conn: sqlite3.Connection) -> Category:
    """Return the seeded ``Virement interne`` category. Asserts it exists."""
    cat = get_by_name(conn, BUILTIN_INTERNAL_TRANSFER)
    if cat is None:
        raise CategoryNotFoundError(
            f"built-in category {BUILTIN_INTERNAL_TRANSFER!r} missing — DB not migrated?"
        )
    return cat
