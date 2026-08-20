-- Awards / Press feature (app data — lives in DB: portal-db prod, portal-db-dev preview).
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0051_awards_press.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0051_awards_press.sql

-- A media outlet that nominates for awards and/or gives press. `review_scale`
-- is the number of levels on their star scale (e.g. 5, 6, 10; null = no stars).
CREATE TABLE IF NOT EXISTS award_media (
	id           TEXT PRIMARY KEY,
	name         TEXT NOT NULL,
	country      TEXT,
	review_scale INTEGER,
	notes        TEXT,
	created_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- One or more people responsible for a media.
CREATE TABLE IF NOT EXISTS award_media_contact (
	id       TEXT PRIMARY KEY,
	media_id TEXT NOT NULL,
	name     TEXT,
	email    TEXT,
	phone    TEXT,
	role     TEXT
);
CREATE INDEX IF NOT EXISTS idx_award_contact_media ON award_media_contact(media_id);

-- A single product's appearance with a media on a date: an award nomination
-- (category / winner / disclosure) and/or a review (via award_statement rows).
CREATE TABLE IF NOT EXISTS press_instance (
	id              TEXT PRIMARY KEY,
	media_id        TEXT NOT NULL,
	sku             TEXT,
	product_name    TEXT,
	award_category  TEXT,             -- set = it's a nomination (e.g. "Best Family Game 2026")
	is_winner       INTEGER NOT NULL DEFAULT 0,
	disclosure_date TEXT,             -- YYYY-MM-DD; when a win may be announced (badge logic later)
	instance_date   TEXT,            -- YYYY-MM-DD; the event/publication date used for grouping
	proof_url       TEXT,             -- link to the source
	proof_key       TEXT,             -- OR an uploaded file in R2 (served via /api/img)
	notes           TEXT,
	created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_press_media ON press_instance(media_id);
CREATE INDEX IF NOT EXISTS idx_press_date ON press_instance(instance_date);

-- Review statement(s) for an instance, with an optional score on the media scale.
CREATE TABLE IF NOT EXISTS award_statement (
	id          TEXT PRIMARY KEY,
	instance_id TEXT NOT NULL,
	statement   TEXT,
	score       REAL,                 -- 0..media.review_scale (nullable)
	created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_stmt_instance ON award_statement(instance_id);

-- Permission toggle (single unit under Sales).
ALTER TABLE permission_sets ADD COLUMN access_awards INTEGER NOT NULL DEFAULT 0;
