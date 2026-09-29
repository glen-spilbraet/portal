-- 0062_event_emails.sql — timed email flow for events (builder only; sending later).

-- One step in the flow, timed relative to the event date.
--   offset_days: signed — negative = before the event, positive = after, 0 = day of.
--   ask_participants / ask_images: what this email requests.
--   skip_if_complete: for after-event steps, don't send if BOTH actual participants
--                     and at least one image are already collected.
CREATE TABLE IF NOT EXISTS event_email_step (
	id                TEXT PRIMARY KEY,
	offset_days       INTEGER NOT NULL,
	name              TEXT NOT NULL,
	ask_participants  INTEGER NOT NULL DEFAULT 0,
	ask_images        INTEGER NOT NULL DEFAULT 0,
	skip_if_complete  INTEGER NOT NULL DEFAULT 0,
	active            INTEGER NOT NULL DEFAULT 1,
	sort              INTEGER NOT NULL DEFAULT 0,
	created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_email_step_offset ON event_email_step(offset_days);

-- Per-step, per-language content (da | se | no | en).
CREATE TABLE IF NOT EXISTS event_email_template (
	step_id   TEXT NOT NULL,
	lang      TEXT NOT NULL,
	subject   TEXT,
	body      TEXT,
	PRIMARY KEY (step_id, lang)
);

-- Seed the default flow (names in English; templates authored in the UI, da first).
INSERT OR IGNORE INTO event_email_step (id, offset_days, name, ask_participants, ask_images, skip_if_complete, active, sort) VALUES
	('seed-4w-before', -28, '4 weeks before — ask for participants',            1, 0, 0, 1, 10),
	('seed-1w-before',  -7, '1 week before — participants + good luck',         1, 0, 0, 1, 20),
	('seed-1d-after',    1, '1 day after — ask for images + participants',      1, 1, 1, 1, 30),
	('seed-3d-after',    3, '3 days after — reminder (images + participants)',  1, 1, 1, 1, 40),
	('seed-7d-after',    7, '7 days after — reminder (images + participants)',  1, 1, 1, 1, 50),
	('seed-14d-after',  14, '14 days after — final reminder',                   1, 1, 1, 1, 60);
