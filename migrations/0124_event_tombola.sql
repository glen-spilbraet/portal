-- 0124_event_tombola.sql — Event Tombola: QR sign-up + live big-screen board + prize draw.
-- One tombola per event (public join link /tombola/<code>). Participant data is NEVER
-- deleted by the app (shoutouts are hidden, not deleted; deleting the event keeps them).
-- Apply to BOTH portal-db-dev and portal-db (DB binding, per environment).

CREATE TABLE IF NOT EXISTS tombola (
	id          TEXT PRIMARY KEY,
	event_id    TEXT NOT NULL UNIQUE,
	code        TEXT NOT NULL UNIQUE,          -- short public code in the join URL
	status      TEXT NOT NULL DEFAULT 'open',  -- open | closed
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	created_by  TEXT,
	closed_at   TEXT
);

CREATE TABLE IF NOT EXISTS tombola_entry (
	id           TEXT PRIMARY KEY,
	tombola_id   TEXT NOT NULL,
	first_name   TEXT NOT NULL,
	last_name    TEXT NOT NULL,
	email        TEXT NOT NULL,                -- stored lower-cased
	zip          TEXT NOT NULL,
	device_token TEXT NOT NULL UNIQUE,         -- secret kept in the phone's localStorage
	consent      INTEGER NOT NULL DEFAULT 1,
	user_agent   TEXT,
	created_at   TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE (tombola_id, email)
);
CREATE INDEX IF NOT EXISTS idx_tombola_entry_t ON tombola_entry (tombola_id, created_at);

CREATE TABLE IF NOT EXISTS tombola_shoutout (
	id          TEXT PRIMARY KEY,
	tombola_id  TEXT NOT NULL,
	entry_id    TEXT NOT NULL,
	message     TEXT NOT NULL,
	hidden      INTEGER NOT NULL DEFAULT 0,    -- moderation: hidden from the board, never deleted
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tombola_shout_t ON tombola_shoutout (tombola_id, created_at);

CREATE TABLE IF NOT EXISTS tombola_winner (
	id          TEXT PRIMARY KEY,
	tombola_id  TEXT NOT NULL,
	entry_id    TEXT NOT NULL,
	drawn_at    TEXT NOT NULL DEFAULT (datetime('now')),
	drawn_by    TEXT,
	UNIQUE (tombola_id, entry_id)              -- the same person can never win twice
);
