-- Capture the HTTP response of confirmed automation webhooks for diagnostics.
-- Both columns are nullable: older rows stay NULL, and network failures
-- (no HTTP response received) leave them NULL too.

ALTER TABLE automation_pending ADD COLUMN response_status_code INTEGER;
ALTER TABLE automation_pending ADD COLUMN response_body_excerpt TEXT;
