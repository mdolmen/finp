"""``import.*`` commands.

CSV parsing happens on the frontend (where the file picker lives); this
module accepts already-normalized rows and routes them through the same
``operations.insert`` path so the dedup + type-derivation behaviour stays
consistent across CSV and any future open-banking source.
"""

from __future__ import annotations

import sqlite3

from pydantic import BaseModel, ConfigDict, Field

from finp import accounts, operations, rules_engine
from finp.commands._base import Command
from finp.commands.operations import OperationOut


class IngestRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    date: str = Field(min_length=1)
    montant_cents: int
    libelle: str = Field(min_length=1)
    balance_cents: int | None = None


class IngestParams(BaseModel):
    account_id: int
    rows: list[IngestRow]
    apply_rules: bool = True


class IngestResult(BaseModel):
    imported: int
    skipped: int
    rule_assigned: int
    # Existing operations that collided with the incoming rows, so the user
    # can verify visually that dedup did the right thing.
    skipped_existing: list[OperationOut]


def _ingest(conn: sqlite3.Connection, params: IngestParams) -> IngestResult:
    account = accounts.get(conn, params.account_id)
    is_first_import = account.last_import_at is None

    imported = 0
    skipped_existing: list[OperationOut] = []
    for row in params.rows:
        op = operations.insert(
            conn,
            account_id=params.account_id,
            date=row.date,
            montant_cents=row.montant_cents,
            libelle=row.libelle,
            balance_cents=row.balance_cents,
        )
        if op is None:
            existing = operations.find_by_content(
                conn,
                account_id=params.account_id,
                date=row.date,
                montant_cents=row.montant_cents,
                libelle=row.libelle,
                balance_cents=row.balance_cents,
            )
            if existing is not None:
                skipped_existing.append(OperationOut.model_validate(existing))
        else:
            imported += 1

    if is_first_import and imported > 0:
        earliest = min(
            (r for r in params.rows if r.balance_cents is not None),
            key=lambda r: r.date,
            default=None,
        )
        if earliest is not None:
            assert earliest.balance_cents is not None
            accounts.set_initial_balance(
                conn, params.account_id, cents=earliest.balance_cents, date=None
            )

    rule_assigned = rules_engine.apply_rules_bulk(conn) if params.apply_rules else 0
    return IngestResult(
        imported=imported,
        skipped=len(skipped_existing),
        rule_assigned=rule_assigned,
        skipped_existing=skipped_existing,
    )


METHODS: dict[str, Command] = {
    "import.ingest": Command(IngestParams, _ingest),
}
