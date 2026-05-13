-- Tink open-banking integration.
-- One set of API credentials per app (sandbox or production).
-- One token bundle per connected Tink user (there is typically only one).
-- Accounts gain a Tink account ID once linked, and a last-sync timestamp.

CREATE TABLE tink_credentials (
    id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    client_id   TEXT    NOT NULL,
    client_secret TEXT  NOT NULL,
    environment TEXT    NOT NULL DEFAULT 'sandbox'
                        CHECK (environment IN ('sandbox', 'production'))
);

CREATE TABLE tink_tokens (
    tink_user_id    TEXT PRIMARY KEY,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT NOT NULL,
    expires_at      TEXT NOT NULL   -- ISO-8601 UTC
);

ALTER TABLE accounts ADD COLUMN tink_account_id   TEXT;
ALTER TABLE accounts ADD COLUMN tink_last_sync_at TEXT;
