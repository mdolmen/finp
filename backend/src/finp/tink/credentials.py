"""Read and write Tink API credentials (singleton row in tink_credentials)."""

from __future__ import annotations

import sqlite3
from typing import Literal

Environment = Literal["sandbox", "production"]

TINK_API_HOSTS: dict[Environment, str] = {
    "sandbox": "https://api.tink.com",
    "production": "https://api.tink.com",
}


def get(conn: sqlite3.Connection) -> dict | None:
    """Return the stored credentials, or None if not yet configured."""
    row = conn.execute(
        "SELECT client_id, client_secret, environment FROM tink_credentials WHERE id = 1"
    ).fetchone()
    if row is None:
        return None
    return {
        "client_id": row["client_id"],
        "client_secret": row["client_secret"],
        "environment": row["environment"],
    }


def save(
    conn: sqlite3.Connection, client_id: str, client_secret: str, environment: Environment
) -> None:
    """Upsert the singleton credentials row."""
    conn.execute(
        """
        INSERT INTO tink_credentials (id, client_id, client_secret, environment)
        VALUES (1, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            client_id     = excluded.client_id,
            client_secret = excluded.client_secret,
            environment   = excluded.environment
        """,
        (client_id, client_secret, environment),
    )
