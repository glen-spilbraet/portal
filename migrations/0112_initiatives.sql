-- Manual initiatives (Sales → Initiatives): free-form cards shown among the
-- awards/press/events on a shared report's Initiatives pane, plus their own
-- access flag on permission sets. App DB — apply to BOTH portal-db (prod) and
-- portal-db-dev (preview). Apply SQL directly, do NOT use d1 migrations apply.

ALTER TABLE permission_sets ADD COLUMN access_initiatives INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS initiative (
	id         TEXT PRIMARY KEY,
	image_key  TEXT,                -- R2 key, square crop (served via /api/img, ?size=)
	date       TEXT,                -- YYYY-MM-DD
	tag        TEXT,                -- floating pill text, e.g. "Instagram", "Campaign"
	header     TEXT NOT NULL,
	subheader  TEXT,
	country    TEXT,
	skus       TEXT NOT NULL DEFAULT '[]', -- JSON array of product SKUs
	created_by TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_initiative_date ON initiative (date);
