-- Cached report results (custom reports). Apply PER ENVIRONMENT (DB binding):
-- portal-db-dev AND portal-db. Results are keyed by a hash of the report's
-- criteria (rules, metric, date window) and tagged with the sales-sync stamp,
-- so a row is valid until the criteria change or the nightly sync runs.
CREATE TABLE IF NOT EXISTS report_cache (
	key        TEXT PRIMARY KEY,   -- sha-256 of the criteria
	stamp      TEXT NOT NULL,      -- sales_sync_meta.last_run when computed
	payload    TEXT NOT NULL,      -- JSON result
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
