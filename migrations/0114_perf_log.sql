-- Performance log (Admin → Performance): when switched on, one row per slow
-- request with its timing and slowest queries. Off by default; auto-off after
-- the chosen hours. App DB — apply to BOTH portal-db (prod) and portal-db-dev
-- (preview). Apply SQL directly, do NOT use d1 migrations apply.

CREATE TABLE IF NOT EXISTS perf_setting (
	key   TEXT PRIMARY KEY,   -- 'until' (epoch ms; logging on while now < until), 'threshold_ms'
	value TEXT
);

CREATE TABLE IF NOT EXISTS perf_request (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	started_at  INTEGER NOT NULL,  -- epoch ms
	total_ms    INTEGER NOT NULL,  -- request start → response ready
	method      TEXT,
	path        TEXT,
	route       TEXT,              -- SvelteKit route id (groups /sheet/abc + /sheet/def)
	status      INTEGER,
	user_email  TEXT,
	query_count INTEGER,
	query_ms    INTEGER,           -- summed wall time of all queries (incl. waiting)
	db_ms       REAL,              -- summed time the database spent executing them
	rows_read   INTEGER,
	queries     TEXT               -- JSON: slowest queries [{db, sql, ms, dbMs, rows, n}]
);
CREATE INDEX IF NOT EXISTS idx_perf_request_started ON perf_request (started_at);
