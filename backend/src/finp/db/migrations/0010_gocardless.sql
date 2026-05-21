-- Replace the parked Tink integration with GoCardless Bank Account Data (ex-Nordigen).
-- Same PSD2 constraints, but self-serve free tier and user-supplied credentials.

DROP TABLE IF EXISTS tink_tokens;
DROP TABLE IF EXISTS tink_credentials;
ALTER TABLE accounts DROP COLUMN tink_account_id;
ALTER TABLE accounts DROP COLUMN tink_last_sync_at;

-- One developer credential pair per install. The user gets these from the
-- GoCardless Bank Account Data dashboard and pastes them into a settings modal.
CREATE TABLE gocardless_credentials (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    secret_id  TEXT    NOT NULL,
    secret_key TEXT    NOT NULL
);

-- One developer-level token bundle. GoCardless tokens are tied to the
-- secret_id/secret_key, not to any end user, so a single row suffices.
CREATE TABLE gocardless_tokens (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    access          TEXT    NOT NULL,
    access_expires  TEXT    NOT NULL,  -- ISO-8601 UTC
    refresh         TEXT    NOT NULL,
    refresh_expires TEXT    NOT NULL   -- ISO-8601 UTC
);

-- A requisition is the per-bank linking ticket. One requisition may yield
-- multiple GoCardless accounts; each gets mapped to a finp account row.
ALTER TABLE accounts ADD COLUMN gocardless_account_id     TEXT;
ALTER TABLE accounts ADD COLUMN gocardless_requisition_id TEXT;
ALTER TABLE accounts ADD COLUMN gocardless_last_sync_at   TEXT;
