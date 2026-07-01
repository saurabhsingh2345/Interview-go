-- practice_id was GLOBALLY unique, which collides when two partners (or a legacy
-- NULL-partner row) reference the same practice_id. Make it unique PER PARTNER so
-- each partner gets its own interview for a given practice, and per-partner
-- idempotency still holds.

DROP INDEX IF EXISTS idx_interviews_practice_id;

-- Per-partner uniqueness (only for rows that actually carry a practice_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_interviews_partner_practice
    ON interviews (partner_id, practice_id)
    WHERE practice_id IS NOT NULL;

-- Keep a plain (non-unique) index for practice_id lookups.
CREATE INDEX IF NOT EXISTS idx_interviews_practice_id ON interviews (practice_id);
