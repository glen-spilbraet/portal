-- 0063_gurus.sql — Game Gurus (people hired to events): directory, event links
-- (proposals + attendance), internal rating. Plus zip on venues and an
-- email-flow opt-in on venue contacts.

ALTER TABLE venue ADD COLUMN zip TEXT;
ALTER TABLE venue_contact ADD COLUMN in_email_flow INTEGER NOT NULL DEFAULT 1;

-- Guru directory / contact sheet.
CREATE TABLE IF NOT EXISTS guru (
	id             TEXT PRIMARY KEY,
	name           TEXT NOT NULL,
	phone          TEXT,
	email          TEXT,
	zip            TEXT,
	city           TEXT,
	image_key      TEXT,               -- R2 key (IMAGES bucket, gurus/…)
	rating         INTEGER,            -- internal 1–5 (how happy we are), nullable
	in_email_flow  INTEGER NOT NULL DEFAULT 1,
	notes          TEXT,
	active         INTEGER NOT NULL DEFAULT 1,
	created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Gurus attached to an event (proposal → attendance).
--   status: invited | accepted | declined | confirmed
--   proposal_token gates the public accept/decline page.
CREATE TABLE IF NOT EXISTS event_guru (
	event_id       TEXT NOT NULL,
	guru_id        TEXT NOT NULL,
	status         TEXT NOT NULL DEFAULT 'invited',
	proposal_token TEXT UNIQUE,
	responded_at   TEXT,
	created_at     TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (event_id, guru_id)
);
CREATE INDEX IF NOT EXISTS idx_event_guru_event ON event_guru(event_id);
CREATE INDEX IF NOT EXISTS idx_event_guru_guru  ON event_guru(guru_id);
