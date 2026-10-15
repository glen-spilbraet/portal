-- 0077_series.sql — Series under a publisher (one level below Publisher Mapping).
-- On the shared SALES_DB / portal-db so dev + prod are identical.
--
--   series          — named sub-groups belonging to a publisher (KOSMOS → EXIT, Catan).
--   product_series  — per-SKU manual mapping into a series (one series per SKU).
--
-- deal_line_items.series_id stores the RESOLVED series, set only when the series'
-- publisher matches the line's (mapped) publisher — so changing a product's
-- publisher auto-clears a now-invalid series. Series is a mapped-view concept only.
CREATE TABLE IF NOT EXISTS series (
	id          TEXT PRIMARY KEY,
	publisher   TEXT NOT NULL,          -- publisher name (matches deal_line_items.publisher)
	name        TEXT NOT NULL,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE (publisher, name)
);
CREATE TABLE IF NOT EXISTS product_series (
	sku        TEXT PRIMARY KEY,        -- one series per product
	series_id  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_series_series ON product_series(series_id);

ALTER TABLE deal_line_items ADD COLUMN series_id TEXT;
CREATE INDEX IF NOT EXISTS idx_dli_series ON deal_line_items(series_id);
