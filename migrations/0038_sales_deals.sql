-- Sales Stats: read-only mirror of HubSpot deals, refreshed daily by the
-- hubspot-sales-sync worker. Lives ONCE in the shared production DB
-- (portal-db) and is read by both dev and prod portal deployments via the
-- SALES_DB binding.
--
-- Apply to portal-db ONLY:
--   wrangler d1 execute portal-db --remote --file=migrations/0038_sales_deals.sql
--
-- Scope of synced deals: hs_is_closed_won = true AND auto_imported = "true".
-- All monetary values are hs_projected_amount, already normalised to DKK by HubSpot.

CREATE TABLE IF NOT EXISTS sales_deals (
	deal_id         TEXT PRIMARY KEY,   -- HubSpot deal id
	deal_name       TEXT,
	close_date      TEXT,               -- YYYY-MM-DD (from closedate)
	amount_dkk      REAL,               -- hs_projected_amount, already in DKK
	amount_raw      REAL,               -- amount, in the deal's original currency
	currency        TEXT,               -- deal_currency_code (original currency)
	pipeline        TEXT,
	dealstage       TEXT,
	company_id      TEXT,
	company_name    TEXT,
	owner_email     TEXT,               -- COMPANY owner email (drives access + owner filter)
	owner_name      TEXT,               -- company owner display name
	country         TEXT,               -- company country, raw (e.g. "Denmark", "Færøerne", "")
	market          TEXT,               -- derived: Denmark | Sweden | Norway | International
	customer_group  TEXT,               -- company customer_group
	customer_level  TEXT,               -- company customer_color
	updated_at      TEXT                -- deal hs_lastmodifieddate
);

CREATE INDEX IF NOT EXISTS idx_sales_deals_close  ON sales_deals (close_date);
CREATE INDEX IF NOT EXISTS idx_sales_deals_owner  ON sales_deals (owner_email);
CREATE INDEX IF NOT EXISTS idx_sales_deals_market ON sales_deals (market);
CREATE INDEX IF NOT EXISTS idx_sales_deals_country ON sales_deals (country);
CREATE INDEX IF NOT EXISTS idx_sales_deals_group  ON sales_deals (customer_group);
CREATE INDEX IF NOT EXISTS idx_sales_deals_level  ON sales_deals (customer_level);

-- Single-row table holding the status of the most recent sync run.
CREATE TABLE IF NOT EXISTS sales_sync_meta (
	id          INTEGER PRIMARY KEY CHECK (id = 1),
	last_run    TEXT,      -- ISO timestamp of last completed run
	status      TEXT,      -- 'ok' | 'error' | 'running'
	deal_count  INTEGER,   -- number of deals written on the last successful run
	message     TEXT       -- error detail or summary
);
