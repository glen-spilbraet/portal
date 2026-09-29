-- 0061_event_contacts_log.sql — attach venue contacts to events + participant change log.

-- Which venue contacts are attached to an event (for automated emails etc.).
CREATE TABLE IF NOT EXISTS event_contact (
	event_id    TEXT NOT NULL,
	contact_id  TEXT NOT NULL,
	PRIMARY KEY (event_id, contact_id)
);
CREATE INDEX IF NOT EXISTS idx_event_contact_event ON event_contact(event_id);

-- Audit log of participant-count changes (expected / actual), from venue or us.
CREATE TABLE IF NOT EXISTS event_participant_log (
	id          TEXT PRIMARY KEY,
	event_id    TEXT NOT NULL,
	field       TEXT NOT NULL,           -- 'expected' | 'actual'
	old_value   INTEGER,
	new_value   INTEGER,
	source      TEXT NOT NULL,           -- 'venue' | 'internal'
	actor       TEXT,                    -- email, or 'venue'
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_participant_log_event ON event_participant_log(event_id);
