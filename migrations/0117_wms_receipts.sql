-- Goods receipts (restocks) from the Lagersystem stock log (actionType
-- "Varemodtagelse"), synced nightly by the lagersystem-sync worker, plus the
-- per-SKU restock figures the nightly SKU-activity rollup derives from them.
-- Lets the Warehouse "Slow movers / Dead stock" tab measure sales pace since the
-- last restock instead of over a fixed window (a product that was sold out for
-- months and just got restocked is no longer flagged as a slow mover).
-- SALES_DB — apply to portal-db ONLY (shared by every environment; apply SQL
-- directly with `wrangler d1 execute portal-db --remote --file=…`, NOT
-- `d1 migrations apply`). Purely additive. Apply BEFORE deploying the worker.

CREATE TABLE IF NOT EXISTS wms_receipts (
  id           INTEGER PRIMARY KEY,   -- Lagersystem stock-log movement id
  item_number  TEXT NOT NULL,
  quantity     INTEGER NOT NULL,      -- units received (+)
  date         TEXT NOT NULL,         -- YYYY-MM-DD of the receipt
  ts           TEXT                   -- raw timestamp from Lagersystem
);
CREATE INDEX IF NOT EXISTS idx_wms_receipts_sku_date ON wms_receipts (item_number, date);
CREATE INDEX IF NOT EXISTS idx_wms_receipts_date ON wms_receipts (date);

ALTER TABLE wms_sku_activity ADD COLUMN last_restock TEXT;                              -- latest receipt date (NULL = none logged)
ALTER TABLE wms_sku_activity ADD COLUMN restock_qty INTEGER;                            -- units received on that date
ALTER TABLE wms_sku_activity ADD COLUMN units_since_restock INTEGER NOT NULL DEFAULT 0; -- units shipped since then
