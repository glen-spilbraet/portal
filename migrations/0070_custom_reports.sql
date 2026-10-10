-- Custom reports: a named sales report with include/exclude product rules and a
-- shareable read-only link. Definitions live in the app DB; the figures are
-- computed live against SALES_DB (deal_line_items / sales_deals).
CREATE TABLE IF NOT EXISTS report (
	id           TEXT PRIMARY KEY,
	name         TEXT NOT NULL DEFAULT 'Untitled report',
	share_token  TEXT UNIQUE,
	metric       TEXT NOT NULL DEFAULT 'both',        -- units | revenue | both
	period       TEXT NOT NULL DEFAULT 'rolling_12m', -- rolling last 12 months (v1)
	created_by   TEXT,
	created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
	updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Product selection rules, evaluated as: (union of include rules, or all products
-- when there are none) minus anything matching an exclude rule.
CREATE TABLE IF NOT EXISTS report_rule (
	id         TEXT PRIMARY KEY,
	report_id  TEXT NOT NULL,
	action     TEXT NOT NULL,   -- include | exclude
	kind       TEXT NOT NULL,   -- publisher_sku | publisher_mapped | sku
	value      TEXT NOT NULL,
	sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_report_rule_report ON report_rule(report_id);

-- New permission for managing reports.
ALTER TABLE permission_sets ADD COLUMN access_reports INTEGER NOT NULL DEFAULT 0;
