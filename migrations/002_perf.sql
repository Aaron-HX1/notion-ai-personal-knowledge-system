ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'queued';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stage_updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS jobs_stage_idx ON jobs(status,stage,created_at);
CREATE TABLE IF NOT EXISTS analysis_cache (
 fingerprint text NOT NULL,
 provider text NOT NULL,
 model text NOT NULL,
 analysis jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (fingerprint,provider,model)
);
CREATE INDEX IF NOT EXISTS analysis_cache_created_idx ON analysis_cache(created_at);
