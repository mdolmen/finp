-- Add credentials_id (Tink's bank-credential identifier returned in the OAuth
-- callback) to tink_tokens, and relax refresh_token to allow empty string since
-- Tink does not return a refresh_token in the authorization_code flow.

ALTER TABLE tink_tokens ADD COLUMN credentials_id TEXT NOT NULL DEFAULT '';
