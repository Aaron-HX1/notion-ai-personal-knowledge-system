ALTER TABLE resources ADD COLUMN IF NOT EXISTS score integer CHECK (score IS NULL OR score BETWEEN 1 AND 10);
ALTER TABLE resources ADD COLUMN IF NOT EXISTS priority_level text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS reminder_date date;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS review_status text;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS user_note text NOT NULL DEFAULT '';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS score_updated_at timestamptz;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS review_notified_at timestamptz;
CREATE INDEX IF NOT EXISTS resources_review_idx ON resources(score DESC, reminder_date, review_status);
CREATE TABLE IF NOT EXISTS weekly_reviews (
 id uuid PRIMARY KEY,
 week_start date NOT NULL,
 report text NOT NULL,
 resources jsonb NOT NULL,
 archived_collection_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
