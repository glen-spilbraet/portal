-- HubSpot ↔ Rackbeat verification results (amount & close date).
-- Cached from an on-demand run; verification_issues holds only the discrepancies.
CREATE TABLE IF NOT EXISTS verification_issues (
	deal_id        TEXT PRIMARY KEY,
	deal_name      TEXT,
	rackbeat_id    TEXT,
	owner_name     TEXT,
	company_name   TEXT,
	close_date     TEXT,
	amount_raw     REAL,
	currency       TEXT,
	invoice_number TEXT,
	rb_date        TEXT,
	rb_subtotal    REAL,
	amount_match   INTEGER,
	date_match     INTEGER,
	issue          TEXT
);

CREATE TABLE IF NOT EXISTS verification_meta (
	id              INTEGER PRIMARY KEY,
	last_run        TEXT,
	checked         INTEGER,
	ok              INTEGER,
	amount_mismatch INTEGER,
	date_mismatch   INTEGER,
	not_found       INTEGER,
	multiple        INTEGER,
	status          TEXT,
	message         TEXT
);
