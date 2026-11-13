-- 0118_brand_pages.sql — webshop landing-page content for every publisher and
-- series (subheader + text per language, and one 4:3 image, often a logo).
-- On the shared SALES_DB / portal-db (like publisher + series), so dev + prod
-- edit and serve one identical set. Apply to portal-db only.
--
--   brand_page       — one row per publisher / series: the image.
--   brand_page_text  — per language: subheader + text.
--
-- kind = 'publisher' → ref = publisher name (publisher.name)
-- kind = 'series'    → ref = series id     (series.id)

CREATE TABLE IF NOT EXISTS brand_page (
	kind        TEXT NOT NULL,
	ref         TEXT NOT NULL,
	image_key   TEXT,                 -- R2 key in portal-images (4:3)
	updated_by  TEXT,
	updated_at  TEXT,
	PRIMARY KEY (kind, ref)
);

CREATE TABLE IF NOT EXISTS brand_page_text (
	kind        TEXT NOT NULL,
	ref         TEXT NOT NULL,
	language    TEXT NOT NULL,        -- da | sv | no | en | pl
	subheader   TEXT,
	body        TEXT,
	PRIMARY KEY (kind, ref, language)
);
