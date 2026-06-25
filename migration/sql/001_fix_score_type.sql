DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name  = 'interviews'
          AND column_name = 'score'
          AND data_type   IN ('character varying', 'text', 'character')
    ) THEN
        ALTER TABLE interviews
            ALTER COLUMN score TYPE double precision
            USING CASE
                WHEN score IS NULL OR TRIM(score) = '' THEN 0.0
                ELSE TRIM(score)::double precision
            END;
        ALTER TABLE interviews ALTER COLUMN score SET DEFAULT 0;
    END IF;
END $$
