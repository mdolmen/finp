-- Initial schema (v1).
-- Money is stored in integer cents to avoid float drift.
-- Dates use ISO 8601 TEXT (YYYY-MM-DD); timestamps use ISO 8601 with offset.

CREATE TABLE accounts (
    id                INTEGER PRIMARY KEY,
    name              TEXT    NOT NULL UNIQUE,
    csv_mapping_json  TEXT,
    created_at        TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE categories (
    id             INTEGER PRIMARY KEY,
    name           TEXT    NOT NULL UNIQUE,
    is_builtin     INTEGER NOT NULL DEFAULT 0 CHECK (is_builtin IN (0, 1)),
    display_order  INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (name, is_builtin, display_order)
VALUES ('Virement interne', 1, 0);

CREATE TABLE operations (
    id            INTEGER PRIMARY KEY,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date          TEXT    NOT NULL,
    montant_cents INTEGER NOT NULL,
    libelle       TEXT    NOT NULL,
    type          TEXT    NOT NULL CHECK (type IN ('debit', 'credit', 'internal')),
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    dedup_hash    TEXT    NOT NULL UNIQUE,
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_operations_account_date ON operations(account_id, date);
CREATE INDEX idx_operations_category     ON operations(category_id);
CREATE INDEX idx_operations_type_date    ON operations(type, date);

CREATE TABLE rules (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    priority        INTEGER NOT NULL DEFAULT 0,
    predicate_json  TEXT    NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_rules_category_priority ON rules(category_id, priority);

CREATE VIRTUAL TABLE operations_fts USING fts5(
    libelle,
    content='operations',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER operations_ai AFTER INSERT ON operations BEGIN
    INSERT INTO operations_fts(rowid, libelle) VALUES (new.id, new.libelle);
END;

CREATE TRIGGER operations_ad AFTER DELETE ON operations BEGIN
    INSERT INTO operations_fts(operations_fts, rowid, libelle)
    VALUES ('delete', old.id, old.libelle);
END;

CREATE TRIGGER operations_au AFTER UPDATE OF libelle ON operations BEGIN
    INSERT INTO operations_fts(operations_fts, rowid, libelle)
    VALUES ('delete', old.id, old.libelle);
    INSERT INTO operations_fts(rowid, libelle) VALUES (new.id, new.libelle);
END;
