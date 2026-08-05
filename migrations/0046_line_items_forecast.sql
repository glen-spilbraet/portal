-- Line items + forecast deals. All in the shared SALES_DB (portal-db):
--   wrangler d1 execute portal-db --remote --file=migrations/0046_line_items_forecast.sql

-- Forecast deals: same pipeline as closed, dealstage IN (Forecasting 961100990,
-- Expired Forecast 5037397224). Isolated from sales_deals so Sales Stats is
-- untouched. Mirrors sales_deals columns + the forecast window + last_contacted.
CREATE TABLE IF NOT EXISTS forecast_deals (
	deal_id             TEXT PRIMARY KEY,
	deal_name           TEXT,
	close_date          TEXT,
	amount_dkk          REAL,
	amount_raw          REAL,
	currency            TEXT,
	pipeline            TEXT,
	dealstage           TEXT,          -- 961100990 (Forecasting) | 5037397224 (Expired Forecast)
	company_id          TEXT,
	company_name        TEXT,
	owner_email         TEXT,
	owner_name          TEXT,
	country             TEXT,
	market              TEXT,
	customer_group      TEXT,
	customer_level      TEXT,
	last_contacted      TEXT,
	rackbeat_id         TEXT,
	updated_at          TEXT,
	forecast_start_date TEXT,          -- forecast_start_date
	forecast_end_date   TEXT           -- forecast_end_date
);

-- Line items for BOTH worlds, partitioned by deal_kind. Populated by CSV import
-- (bulk) + worker incremental. amount_dkk = HubSpot "Line Item Revenue in
-- Company Currency" (fallback: net_price for DKK, net_price×deal rate for others).
CREATE TABLE IF NOT EXISTS deal_line_items (
	line_item_id        TEXT PRIMARY KEY,
	deal_id             TEXT NOT NULL,
	deal_kind           TEXT NOT NULL,  -- 'closed' | 'forecast'
	company_id          TEXT,
	close_date          TEXT,           -- from the deal (closed); forecast uses its window
	sku                 TEXT,
	sku_prefix          TEXT,           -- leading alpha of SKU (publisher grouping key)
	name                TEXT,
	unit_price          REAL,
	discount            REAL,
	net_price           REAL,           -- net line total, deal currency
	amount_dkk          REAL,
	currency            TEXT,
	quantity            REAL,
	publisher           TEXT,           -- resolved: override → prefix map → prefix code
	quantity_log_create REAL,           -- forecast only
	quantity_log_start  REAL            -- forecast only
);
CREATE INDEX IF NOT EXISTS idx_dli_deal ON deal_line_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_dli_company ON deal_line_items(company_id);
CREATE INDEX IF NOT EXISTS idx_dli_kind_pub ON deal_line_items(deal_kind, publisher);
CREATE INDEX IF NOT EXISTS idx_dli_prefix ON deal_line_items(sku_prefix);

-- Publisher mapping (admin-editable). Resolution: override(sku) → prefix(longest) → prefix code.
CREATE TABLE IF NOT EXISTS publisher_prefix (
	prefix    TEXT PRIMARY KEY,
	publisher TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS product_publisher_override (
	sku       TEXT PRIMARY KEY,
	publisher TEXT NOT NULL
);
INSERT OR IGNORE INTO publisher_prefix (prefix, publisher) VALUES
	('GO', 'Goliath'),
	('SG', 'SmartGames'),
	('LPFI', 'Lautapelit');
