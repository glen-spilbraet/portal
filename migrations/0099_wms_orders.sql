-- Lagersystem (warehouse) order mirror, for the Orders → Warehouse dashboard
-- (Inbound vs Handled over time). Populated by the lagersystem-sync worker,
-- which pages the Lagersystem status lists. DB binding — apply to BOTH
-- portal-db and portal-db-dev (apply SQL directly, do NOT use d1 migrations apply).

CREATE TABLE IF NOT EXISTS wms_orders (
  order_id            TEXT PRIMARY KEY,   -- Lagersystem orderID
  order_number        INTEGER,            -- extra."order number" (clean int)
  sub_site            INTEGER,            -- 1=DK/DKK, 2=SE/SEK, 3=NO/NOK
  currency            TEXT,
  status              TEXT,               -- RECEIVED / PROCESSING / ... / FINISHED
  received_date       TEXT,              -- "YYYY-MM-DD HH:MM:SS"
  done_date           TEXT,              -- "YYYY-MM-DD" once handled, else NULL
  country             TEXT,              -- ISO numeric from the delivery address (208 DK / 752 SE / 578 NO)
  customer_group_id   INTEGER,
  customer_group_name TEXT,
  total_no_tax        REAL,              -- order value ex-VAT, in the order currency
  line_count          INTEGER,           -- number of pick lines
  unit_count          INTEGER,           -- sum of amountDelivered across lines
  synced_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wms_orders_received ON wms_orders (received_date);
CREATE INDEX IF NOT EXISTS idx_wms_orders_done     ON wms_orders (done_date);
CREATE INDEX IF NOT EXISTS idx_wms_orders_status   ON wms_orders (status);
CREATE INDEX IF NOT EXISTS idx_wms_orders_site     ON wms_orders (sub_site);

CREATE TABLE IF NOT EXISTS wms_order_lines (
  order_id        TEXT NOT NULL,         -- FK → wms_orders.order_id
  line_id         TEXT,                  -- Lagersystem lineID
  item_number     TEXT,                  -- = Rackbeat SKU
  title           TEXT,
  amount          INTEGER,               -- units ordered
  amount_delivered INTEGER               -- units shipped
);

CREATE INDEX IF NOT EXISTS idx_wms_lines_order ON wms_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_wms_lines_sku   ON wms_order_lines (item_number);

-- Single-row sync bookkeeping (id = 1).
CREATE TABLE IF NOT EXISTS wms_sync_meta (
  id            INTEGER PRIMARY KEY,
  last_run      TEXT,
  last_done_max TEXT,                    -- newest done_date seen, for incremental FINISHED paging
  orders_seen   INTEGER,
  status        TEXT,                    -- 'ok' | 'error'
  message       TEXT
);
