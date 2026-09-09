-- Rest Check: permission + logs + settings.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0055_rest_check.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0055_rest_check.sql

ALTER TABLE permission_sets ADD COLUMN access_rest_check INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rest_check_settings (
  id              TEXT PRIMARY KEY,          -- always 'default'
  recipient_email TEXT,
  from_email      TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  updated_at      TEXT
);
INSERT OR IGNORE INTO rest_check_settings (id, recipient_email, enabled) VALUES ('default', 'glen@spilbraet.dk', 1);

CREATE TABLE IF NOT EXISTS rest_check_log (
  id                 TEXT PRIMARY KEY,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  source             TEXT,          -- 'webhook' | 'manual'
  rb_order_number    TEXT,
  rb_customer_number TEXT,
  customer_name      TEXT,
  hs_company_id      TEXT,
  matched            INTEGER,       -- 1 if a HubSpot company matched
  rest_deal_count    INTEGER,
  rest_deals         TEXT,          -- JSON: [{id,name}]
  line_items         TEXT,          -- JSON: [{deal_name,sku,product_name,quantity,available_quantity}]
  in_stock_count     INTEGER,
  email_sent         INTEGER,
  email_to           TEXT,
  status             TEXT,          -- 'ok' | 'no_match' | 'no_rest' | 'error'
  error              TEXT
);
CREATE INDEX IF NOT EXISTS idx_rest_check_log_created ON rest_check_log(created_at DESC);
