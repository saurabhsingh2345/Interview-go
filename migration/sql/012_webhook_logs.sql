-- Audit trail of completion-webhook delivery attempts (one row per attempt).

CREATE TABLE IF NOT EXISTS webhook_logs (
    id           BIGSERIAL    PRIMARY KEY,
    created_at   TIMESTAMPTZ,
    updated_at   TIMESTAMPTZ,
    deleted_at   TIMESTAMPTZ,
    interview_id BIGINT       NOT NULL,
    partner_id   BIGINT,
    event        VARCHAR(64)  NOT NULL,
    url          TEXT         NOT NULL,
    attempt      INT          NOT NULL,
    status_code  INT,
    success      BOOLEAN      NOT NULL DEFAULT FALSE,
    error        TEXT
);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_interview_id ON webhook_logs (interview_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_deleted_at ON webhook_logs (deleted_at);
