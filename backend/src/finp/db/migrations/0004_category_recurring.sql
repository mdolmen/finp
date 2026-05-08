-- Mark a category whose operations recur monthly. The Bilan chart projects
-- the most recent realized amount onto future months in the window with the
-- 'planned' style, alongside any explicit Operations prévues.

ALTER TABLE categories ADD COLUMN is_recurring INTEGER NOT NULL DEFAULT 0
    CHECK (is_recurring IN (0, 1));
