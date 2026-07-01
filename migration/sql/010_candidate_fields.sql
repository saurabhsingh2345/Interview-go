-- Partner-supplied candidate identity + external reference + return redirect.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS candidate_name  VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS candidate_email VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS external_id     VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS redirect_url    TEXT         NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_interviews_external_id ON interviews (external_id);
