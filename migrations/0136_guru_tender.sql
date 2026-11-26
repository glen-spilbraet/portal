-- 0136_guru_tender.sql — Guru tender: an event lists one or more "openings"
-- (e.g. 2 × Strategi, 1 × Familie, 1 × Børnespil; label may be blank for a
-- general opening). Invited gurus open their personal link and take a free
-- spot, first come first served. event_guru.opening_id = the spot they took;
-- event_guru.sent_at = when the tender e-mail was last sent to them.
-- Per-env DB (DB binding): apply to portal-db-dev and portal-db.
CREATE TABLE IF NOT EXISTS event_guru_opening (
	id          TEXT PRIMARY KEY,
	event_id    TEXT NOT NULL,
	label       TEXT,
	slots       INTEGER NOT NULL DEFAULT 1,
	position    INTEGER NOT NULL DEFAULT 0,
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_guru_opening_event ON event_guru_opening(event_id);
ALTER TABLE event_guru ADD COLUMN opening_id TEXT;
ALTER TABLE event_guru ADD COLUMN sent_at TEXT;
