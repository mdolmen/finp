-- Move the recurring flag from categories to individual operations.
-- An operation marked is_recurring=1 is used as a template for bilan
-- projections: the bilan projects its (libelle, montant) pattern onto
-- future months until a matching real operation appears in that month.

ALTER TABLE operations ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0
    CHECK (is_recurring IN (0, 1));
