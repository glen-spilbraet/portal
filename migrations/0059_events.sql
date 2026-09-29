-- 0059_events.sql — Event management: venues, contacts, event types, events,
-- event↔SKU links, and event assets (media + marketing). Plus the `events`
-- permission. Venue-facing access is via an unguessable per-event share_token.

-- Permission column (mirrors access_awards / access_rest_check / access_price_sync).
ALTER TABLE permission_sets ADD COLUMN access_events INTEGER NOT NULL DEFAULT 0;

-- Venues we host events at.
CREATE TABLE IF NOT EXISTS venue (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	address     TEXT,
	city        TEXT,
	country     TEXT,
	notes       TEXT,
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Contact people at a venue (a venue can have several).
CREATE TABLE IF NOT EXISTS venue_contact (
	id          TEXT PRIMARY KEY,
	venue_id    TEXT NOT NULL,
	name        TEXT,
	phone       TEXT,
	email       TEXT,
	role        TEXT,
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_venue_contact_venue ON venue_contact(venue_id);

-- User-defined event types (small lookup, managed in the UI).
CREATE TABLE IF NOT EXISTS event_type (
	id    TEXT PRIMARY KEY,
	name  TEXT NOT NULL
);

-- Events. share_token gates the public venue page.
CREATE TABLE IF NOT EXISTS event (
	id                     TEXT PRIMARY KEY,
	venue_id               TEXT,
	type_id                TEXT,
	title                  TEXT,
	event_date             TEXT,            -- YYYY-MM-DD
	start_time             TEXT,            -- HH:MM
	end_time               TEXT,            -- HH:MM
	entry_fee              REAL,
	participants_expected  INTEGER,
	participants_actual    INTEGER,
	status                 TEXT NOT NULL DEFAULT 'planned',  -- planned|confirmed|done|cancelled
	share_token            TEXT UNIQUE,
	notes                  TEXT,
	created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_venue ON event(venue_id);
CREATE INDEX IF NOT EXISTS idx_event_date  ON event(event_date);

-- Which product SKUs are featured at an event (join to sales_sheets by SKU).
CREATE TABLE IF NOT EXISTS event_sku (
	event_id  TEXT NOT NULL,
	sku       TEXT NOT NULL,
	sort      INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (event_id, sku)
);

-- Files attached to an event, stored in the IMAGES R2 bucket under events/.
--   category 'media'     = photos/video of/for the event (we OR the venue upload)
--   category 'marketing' = assets we share TO the venue (download-only for them)
--   source   internal|venue = who uploaded it
CREATE TABLE IF NOT EXISTS event_asset (
	id                 TEXT PRIMARY KEY,
	event_id           TEXT NOT NULL,
	category           TEXT NOT NULL DEFAULT 'media',      -- media|marketing
	kind               TEXT NOT NULL DEFAULT 'file',       -- image|video|file
	r2_key             TEXT NOT NULL,
	filename           TEXT,
	content_type       TEXT,
	size               INTEGER,
	source             TEXT NOT NULL DEFAULT 'internal',   -- internal|venue
	shared_with_venue  INTEGER NOT NULL DEFAULT 1,
	uploaded_by        TEXT,
	created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_event_asset_event ON event_asset(event_id);
