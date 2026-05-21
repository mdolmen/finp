"""Read and write GoCardless API credentials (singleton row in gocardless_credentials)."""

from __future__ import annotations

import sqlite3


def get(conn: sqlite3.Connection) -> dict | None:
    """Return the stored credentials, or None if not yet configured."""
    row = conn.execute(
        "SELECT secret_id, secret_key FROM gocardless_credentials WHERE id = 1"
    ).fetchone()
    if row is None:
        return None
    return {"secret_id": row["secret_id"], "secret_key": row["secret_key"]}


def save(conn: sqlite3.Connection, secret_id: str, secret_key: str) -> None:
    """Upsert the singleton credentials row."""
    conn.execute(
        """
        INSERT INTO gocardless_credentials (id, secret_id, secret_key)
        VALUES (1, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            secret_id  = excluded.secret_id,
            secret_key = excluded.secret_key
        """,
        (secret_id, secret_key),
    )
