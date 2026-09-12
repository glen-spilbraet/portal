-- Price Sync foundation: a local cache of Rackbeat custom prices for selected
-- customers / customer groups. Feeds the HubSpot price sync + catalogues later.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0058_price_cache.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0058_price_cache.sql

CREATE TABLE IF NOT EXISTS price_source (
  id             TEXT PRIMARY KEY,
  type           TEXT NOT NULL,   -- 'customer' | 'group'
  ref            TEXT NOT NULL,   -- Rackbeat customer id/number OR customer-group number
  name           TEXT,            -- display name (auto-fetched from Rackbeat)
  currency       TEXT,
  enabled        INTEGER NOT NULL DEFAULT 1,
  product_count  INTEGER,         -- # custom prices found
  scanned_count  INTEGER,         -- # products scanned in total
  last_synced_at TEXT,
  status         TEXT,            -- 'pending' | 'ok' | 'error'
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(type, ref)
);

CREATE TABLE IF NOT EXISTS custom_price (
  source_id     TEXT NOT NULL,
  sku           TEXT NOT NULL,
  custom_price  REAL,
  regular_price REAL,
  updated_at    TEXT,
  PRIMARY KEY (source_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_custom_price_sku ON custom_price(sku);
CREATE INDEX IF NOT EXISTS idx_custom_price_source ON custom_price(source_id);
