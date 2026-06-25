ALTER TABLE follow_up_contexts ADD COLUMN IF NOT EXISTS selected_branch VARCHAR(10) NOT NULL DEFAULT '';
ALTER TABLE follow_up_contexts ADD COLUMN IF NOT EXISTS branch_reasoning TEXT NOT NULL DEFAULT '';
