-- Automatisations: human-validated outbound webhook bridge over the event bus.
-- An automation matches events of a given type whose embedded operation
-- satisfies a predicate (same shape as rules). Each match is queued and only
-- fires its callback once the user explicitly confirms it.

CREATE TABLE automations (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    event_type      TEXT    NOT NULL,
    predicate_json  TEXT    NOT NULL,
    callback_url    TEXT    NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_automations_event_type ON automations(event_type);

CREATE TABLE automation_pending (
    id                  INTEGER PRIMARY KEY,
    automation_id       INTEGER NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    operation_id        INTEGER REFERENCES operations(id) ON DELETE SET NULL,
    event_type          TEXT    NOT NULL,
    event_payload_json  TEXT    NOT NULL,
    status              TEXT    NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'sent', 'failed', 'refused')),
    error               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    resolved_at         TEXT
);

CREATE INDEX idx_automation_pending_status_created
    ON automation_pending(status, created_at DESC);

-- Dedup: a given (automation, event_type, operation) only enqueues once while
-- still pending. Re-enqueue after resolution is allowed (the same operation
-- can match again later if it's updated).
CREATE UNIQUE INDEX idx_automation_pending_dedup
    ON automation_pending(automation_id, event_type, operation_id)
    WHERE status = 'pending';
