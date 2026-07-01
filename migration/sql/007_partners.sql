-- Third-party API access: partners + hashed bearer keys, and interview tenancy.

CREATE TABLE IF NOT EXISTS partners (
    id         BIGSERIAL    PRIMARY KEY,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255),
    active     BOOLEAN      NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_partners_deleted_at ON partners (deleted_at);

CREATE TABLE IF NOT EXISTS api_keys (
    id           BIGSERIAL   PRIMARY KEY,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    partner_id   BIGINT      NOT NULL REFERENCES partners (id) ON DELETE CASCADE,
    name         VARCHAR(255),
    key_hash     VARCHAR(64) NOT NULL,
    key_prefix   VARCHAR(16),
    active       BOOLEAN     NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_partner_id ON api_keys (partner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_deleted_at ON api_keys (deleted_at);

-- Tenancy: which partner owns each interview (NULL = legacy / first-party).
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS partner_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_interviews_partner_id ON interviews (partner_id);
