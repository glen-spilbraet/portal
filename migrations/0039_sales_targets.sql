-- Index targets for the quarterly target tracker on the Sales Stats dashboard.
-- Each row is one named target tier for a given year (e.g. 2026 "Bonus" = index 125).
CREATE TABLE IF NOT EXISTS sales_targets (
	id          TEXT PRIMARY KEY,
	year        INTEGER NOT NULL,
	name        TEXT NOT NULL,
	index_value INTEGER NOT NULL,
	created_at  INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sales_targets_year ON sales_targets(year);
