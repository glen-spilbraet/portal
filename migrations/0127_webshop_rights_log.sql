-- History of webshop publish rights: who changed a publisher's licensed markets
-- or a product's published markets, when, and from what to what. Until now only
-- the last writer of a product was kept, and nothing at all for publishers.
--
--   kind 'publisher' → ref = publisher name   before/after = JSON market list
--   kind 'product'   → ref = SKU              before/after = JSON
--                      { markets: string[] | null (null = follow the licence), override: boolean }
--
-- SALES_DB (shared prod portal-db) — apply ONCE to portal-db, like the tables it
-- describes (migration 0080). The Portal works without it (logging is skipped).
CREATE TABLE IF NOT EXISTS webshop_rights_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  ref        TEXT NOT NULL,
  before     TEXT,
  after      TEXT,
  source     TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_webshop_rights_log_ref ON webshop_rights_log(kind, ref, changed_at);
CREATE INDEX IF NOT EXISTS idx_webshop_rights_log_at  ON webshop_rights_log(changed_at);
