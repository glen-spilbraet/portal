-- Company knowledge store (meetings first; generic `type` for future kinds).
-- Transcript kept in D1 for easy search; structured fields (tldr/decisions/…)
-- are produced at ingest (by the Cowork agent via MCP, or manually).
ALTER TABLE allowed_users ADD COLUMN department TEXT;   -- Marketing|Purchase|Sales|Customer Service
ALTER TABLE permission_sets ADD COLUMN access_knowledge INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS knowledge_item (
	id            TEXT PRIMARY KEY,
	type          TEXT NOT NULL DEFAULT 'meeting',
	title         TEXT,
	happened_on   TEXT,                                   -- YYYY-MM-DD
	source        TEXT,
	transcript    TEXT,
	tldr          TEXT,
	decisions     TEXT,                                   -- JSON array of strings
	action_items  TEXT,                                   -- JSON array of { text, owner }
	topics        TEXT,                                   -- JSON array of strings
	visibility    TEXT NOT NULL DEFAULT 'participants',   -- participants | all_staff
	created_by    TEXT,
	created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_knowledge_date ON knowledge_item(happened_on);

CREATE TABLE IF NOT EXISTS knowledge_participant (
	id            TEXT PRIMARY KEY,
	item_id       TEXT NOT NULL,
	user_email    TEXT,                                   -- links to allowed_users when internal
	external_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_knowledge_participant_item ON knowledge_participant(item_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_participant_email ON knowledge_participant(user_email);

CREATE TABLE IF NOT EXISTS knowledge_department (
	item_id    TEXT NOT NULL,
	department TEXT NOT NULL,
	PRIMARY KEY (item_id, department)
);
