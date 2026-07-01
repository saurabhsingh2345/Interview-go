-- Redirect handoff: interview-scoped browser session tokens + one-time launch nonces.

CREATE TABLE IF NOT EXISTS interview_sessions (
    id              BIGSERIAL   PRIMARY KEY,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    deleted_at      TIMESTAMPTZ,
    interview_id    BIGINT      NOT NULL,
    partner_id      BIGINT      NOT NULL,
    token_hash      VARCHAR(64) NOT NULL,
    candidate_name  VARCHAR(255),
    candidate_email VARCHAR(255),
    expires_at      TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_sessions_token_hash ON interview_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_interview_id ON interview_sessions (interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_deleted_at ON interview_sessions (deleted_at);

CREATE TABLE IF NOT EXISTS handoff_jtis (
    jti        VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);
