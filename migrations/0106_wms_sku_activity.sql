-- Per-SKU sales activity, precomputed nightly by the lagersystem-sync worker
-- (one pass over wms_order_lines) so the Warehouse "Slow movers / Dead stock"
-- tab reads ~5k small rows instead of scanning the whole order history.
-- SALES_DB — apply to portal-db ONLY (shared by every environment; apply SQL
-- directly with `wrangler d1 execute portal-db --remote --file=…`, NOT
-- `d1 migrations apply`). Purely additive.
CREATE TABLE IF NOT EXISTS wms_sku_activity (
  item_number  TEXT PRIMARY KEY,
  title        TEXT,
  category     TEXT,
  vendor       TEXT,
  stock        INTEGER,
  last_sale    TEXT,               -- latest done_date of an order containing the SKU (NULL = none tracked)
  units_90     INTEGER NOT NULL DEFAULT 0,  -- units shipped, last 90 days
  units_180    INTEGER NOT NULL DEFAULT 0,
  units_365    INTEGER NOT NULL DEFAULT 0,
  computed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
