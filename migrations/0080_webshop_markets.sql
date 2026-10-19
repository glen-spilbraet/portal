-- Webshop market licensing + per-product publish state.
-- Lives on SALES_DB (shared prod portal-db), like the publisher registry and
-- the category taxonomy. Markets: DK, SE, NO, INT, PL.

-- Which markets a publisher is licensed to sell in. No rows for a publisher
-- means "no markets allowed" (strict allow-list).
CREATE TABLE IF NOT EXISTS publisher_market (
	publisher TEXT NOT NULL,
	market    TEXT NOT NULL,
	PRIMARY KEY (publisher, market)
);

-- Per-product webshop publish state.
--   published_markets: JSON array of market codes the product is published in.
--                      NULL = never customised → defaults to "all allowed"
--                      (the publisher's licensed markets).
--   override_license:  1 = ignore the publisher licence, all markets selectable.
CREATE TABLE IF NOT EXISTS product_webshop (
	sku               TEXT PRIMARY KEY,
	published_markets TEXT,
	override_license  INTEGER NOT NULL DEFAULT 0,
	updated_by        TEXT,
	updated_at        TEXT
);
