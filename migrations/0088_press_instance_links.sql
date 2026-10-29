-- Per-instance links: a product's mentions/placements (social, article, review,
-- video, podcast, blog, newsletter, webshop, …). Each link has a url + a type.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0088_press_instance_links.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0088_press_instance_links.sql
CREATE TABLE IF NOT EXISTS press_instance_link (
	id          TEXT PRIMARY KEY,
	instance_id TEXT NOT NULL,
	type        TEXT,            -- some / article / review / video / podcast / blog / newsletter / webshop / other
	url         TEXT NOT NULL,
	label       TEXT,            -- optional free label
	created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_press_link_instance ON press_instance_link(instance_id);
