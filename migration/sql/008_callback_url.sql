-- Optional per-interview webhook URL: POSTed a signed payload on completion.
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS callback_url TEXT NOT NULL DEFAULT '';
