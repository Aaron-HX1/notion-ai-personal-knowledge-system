CREATE TABLE IF NOT EXISTS resources (
 notion_id text PRIMARY KEY, notion_url text NOT NULL, source_url text, fingerprint text NOT NULL,
 title text NOT NULL, type text NOT NULL, category text NOT NULL, tags text[] NOT NULL DEFAULT '{}',
 summary text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '', source_name text NOT NULL DEFAULT '',
 collection_ids text[] NOT NULL DEFAULT '{}', attachment_key text, user_fields text[] NOT NULL DEFAULT '{}',
 notion_edited_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS resources_source_url_unique ON resources(source_url) WHERE source_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS resources_fingerprint_idx ON resources(fingerprint);
CREATE INDEX IF NOT EXISTS resources_search_idx ON resources USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(body,'')));
CREATE TABLE IF NOT EXISTS jobs (
 id uuid PRIMARY KEY, notion_id text, kind text NOT NULL, status text NOT NULL, payload jsonb NOT NULL,
 result jsonb, error text, retries int NOT NULL DEFAULT 0, run_after timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_ready_idx ON jobs(status,run_after);
CREATE TABLE IF NOT EXISTS exports (id uuid PRIMARY KEY, collection_id text NOT NULL, object_key text, status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz);
CREATE TABLE IF NOT EXISTS collection_summaries (collection_id text NOT NULL, summary text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS usage_monthly (month text PRIMARY KEY, ai_calls int NOT NULL DEFAULT 0);
