-- Error log (Admin → Error Log). Apply PER ENVIRONMENT (DB binding):
-- portal-db-dev AND portal-db. Every server 5xx, client-side crash and D1 retry
-- is recorded so failures can be traced after the fact (Pages keeps no logs).
CREATE TABLE IF NOT EXISTS error_log (
	id          INTEGER PRIMARY KEY AUTOINCREMENT,
	ref         TEXT,                 -- short id shown to the user on the error page
	at          TEXT NOT NULL DEFAULT (datetime('now')),
	source      TEXT NOT NULL,        -- 'server' | 'client' | 'retry'
	status      INTEGER,
	method      TEXT,
	path        TEXT,
	route       TEXT,                 -- SvelteKit route id, e.g. /sheet/[id]
	message     TEXT,
	stack       TEXT,
	user_email  TEXT,
	user_agent  TEXT,
	fingerprint TEXT NOT NULL,        -- groups identical errors (source + route + normalised message)
	resolved    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_error_log_at ON error_log(at);
CREATE INDEX IF NOT EXISTS idx_error_log_fp ON error_log(fingerprint, at);
CREATE INDEX IF NOT EXISTS idx_error_log_ref ON error_log(ref);
