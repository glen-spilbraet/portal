-- Warehouse dashboard additions. SALES_DB — apply to portal-db ONLY (shared by
-- every environment; apply SQL directly, not `d1 migrations apply`).

-- Orders that left the active queues WITHOUT being handled (cancelled,
-- rejected, deleted). Lets the backlog drop them instead of counting them open
-- forever. Set by the lagersystem-sync worker.
ALTER TABLE wms_orders ADD COLUMN gone_date TEXT;

-- Current stock per SKU, snapshotted from Lagersystem by the worker
-- (POST /api/products + GET /api/product/list). Feeds slow & dead stock.
CREATE TABLE IF NOT EXISTS wms_stock (
  item_number     TEXT PRIMARY KEY,
  title           TEXT,
  category        TEXT,
  vendor          TEXT,
  colli_size      INTEGER,
  min_stock_level INTEGER,
  stock           INTEGER,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
