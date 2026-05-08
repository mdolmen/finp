-- Per-account opening balance: a one-time anchor used for the running solde.
-- After this date (inclusive) every imported operation cumulatively shifts
-- the balance. Date may be NULL when no opening balance has been set, in
-- which case all operations on the account count toward the solde.

ALTER TABLE accounts ADD COLUMN initial_balance_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN initial_balance_date  TEXT;
