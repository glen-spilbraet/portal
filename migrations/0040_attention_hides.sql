-- Snooze / dismiss records for the "Customers Needing Attention" widget.
-- scope 'user'  → applies only to user_email (per-rep snooze or dismiss)
-- scope 'global'→ applies to everyone (admin "mark as dead"); user_email = '*'
-- until_date NULL = indefinite (dismiss); a date = snooze until that day.
CREATE TABLE IF NOT EXISTS attention_hides (
	id          TEXT PRIMARY KEY,
	scope       TEXT NOT NULL,
	user_email  TEXT NOT NULL,
	created_by  TEXT,
	company_id  TEXT NOT NULL,
	until_date  TEXT,
	created_at  INTEGER DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attention_hides_uniq ON attention_hides(scope, user_email, company_id);
CREATE INDEX IF NOT EXISTS idx_attention_hides_company ON attention_hides(company_id);
