-- Anticipated / planned operations: signed montant, no account or category.
-- These are visualized as a separate slice on the Bilan histogram; they are
-- not part of the dedup'd operations table because they don't represent
-- realized money movements.

CREATE TABLE planned_operations (
    id            INTEGER PRIMARY KEY,
    date          TEXT    NOT NULL,
    montant_cents INTEGER NOT NULL,
    libelle       TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_planned_operations_date ON planned_operations(date);
