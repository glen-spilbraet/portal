-- Price Sync: permission + audit log. Corrects HubSpot deal line-item prices to
-- match a customer's custom prices in Rackbeat (skips auto-imported deals).
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0057_price_sync.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0057_price_sync.sql

ALTER TABLE permission_sets ADD COLUMN access_price_sync INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS price_sync_log (
  id                 TEXT PRIMARY KEY,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  user_email         TEXT,
  deal_id            TEXT,
  deal_name          TEXT,
  company_name       TEXT,
  customer_ref       TEXT,          -- company rackbeat_id used against Rackbeat
  currency           TEXT,
  applied            INTEGER,       -- 1 if prices were written, 0 = preview only
  status             TEXT,          -- 'ok' | 'skipped_imported' | 'no_customer' | 'error'
  changed_count      INTEGER,
  lines              TEXT,          -- JSON: [{sku,name,quantity,current_price,customer_price,is_custom,action}]
  error              TEXT
);
CREATE INDEX IF NOT EXISTS idx_price_sync_log_created ON price_sync_log(created_at DESC);
