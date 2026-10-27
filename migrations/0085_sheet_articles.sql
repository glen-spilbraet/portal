-- Web articles attached to a sheet (press, blog, etc.) rendered as visual link
-- cards, and per-market availability for articles + videos. App DB (DB):
-- portal-db + portal-db-dev. markets = JSON array of DK/SE/NO/INT/PL; NULL = all.
CREATE TABLE IF NOT EXISTS sheet_article (
	id            TEXT PRIMARY KEY,
	sheet_id      TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
	url           TEXT NOT NULL,
	title         TEXT,
	description   TEXT,
	site_name     TEXT,
	image_key     TEXT,   -- R2 key of the cached og:image (served via img CDN)
	image_url     TEXT,   -- original og:image URL (reference / fallback)
	favicon_url   TEXT,
	markets       TEXT,   -- JSON array; NULL = all markets
	display_order INTEGER NOT NULL DEFAULT 0,
	created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sheet_article_sheet ON sheet_article(sheet_id);

-- Per-market availability for videos (JSON array; NULL = all markets).
ALTER TABLE sheet_video ADD COLUMN markets TEXT;
