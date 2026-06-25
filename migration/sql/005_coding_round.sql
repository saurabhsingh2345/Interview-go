-- Coding round: store full problem JSON on response
ALTER TABLE responses ADD COLUMN IF NOT EXISTS response_metadata JSONB;
-- Code evaluation fields
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS time_complexity       VARCHAR(50)  NOT NULL DEFAULT '';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS space_complexity      VARCHAR(50)  NOT NULL DEFAULT '';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS has_bugs              BOOLEAN      NOT NULL DEFAULT FALSE;
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS bug_description       TEXT         NOT NULL DEFAULT '';
ALTER TABLE evaluations ADD COLUMN IF NOT EXISTS optimization_possible BOOLEAN      NOT NULL DEFAULT FALSE;
