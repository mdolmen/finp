-- Replace is_recurring boolean with a 3-state recurring column.
-- Values: 'none' | 'monthly' | 'yearly'
ALTER TABLE operations ADD COLUMN recurring TEXT NOT NULL DEFAULT 'none'
    CHECK (recurring IN ('none', 'monthly', 'yearly'));

UPDATE operations SET recurring = 'monthly' WHERE is_recurring = 1;
