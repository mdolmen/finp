"""``import.*`` commands.

CSV parsing happens on the frontend (where the file picker lives); this
module accepts already-normalized rows and routes them through the same
``operations.insert`` path so the dedup + type-derivation behaviour stays
consistent across CSV and any future open-banking source.
"""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel, ConfigDict, Field

from finp import operations, rules_engine
from finp.commands._base import Command


class IngestRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str = Field(min_length=1)
    montant_cents: int
    libelle: str = Field(min_length=1)


class IngestParams(BaseModel):
    account_id: int
    rows: list[IngestRow]
    apply_rules: bool = True


class IngestResult(BaseModel):
    imported: int
    skipped: int
    rule_assigned: int


def _ingest(conn: sqlite3.Connection, params: IngestParams) -> IngestResult:
    imported = 0
    skipped = 0
    for row in params.rows:
        op = operations.insert(
            conn,
            account_id=params.account_id,
            date=row.date,
            montant_cents=row.montant_cents,
            libelle=row.libelle,
        )
        if op is None:
            skipped += 1
        else:
            imported += 1

    rule_assigned = rules_engine.apply_rules_bulk(conn) if params.apply_rules else 0
    return IngestResult(imported=imported, skipped=skipped, rule_assigned=rule_assigned)


METHODS: dict[str, Command] = {
    "import.ingest": Command(IngestParams, _ingest),
}
