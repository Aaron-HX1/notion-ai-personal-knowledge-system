ALTER TABLE resources ADD COLUMN IF NOT EXISTS learning_status text NOT NULL DEFAULT '待学习';
ALTER TABLE resources ADD COLUMN IF NOT EXISTS imported_at timestamptz;
CREATE TABLE IF NOT EXISTS resource_events (
 id uuid PRIMARY KEY, resource_id text NOT NULL, kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS resource_events_time_idx ON resource_events(created_at,kind);
