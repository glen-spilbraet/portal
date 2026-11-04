-- Exclusivity agreements: a SKU sold only to certain customer(s) in a market,
-- optionally for a set period. Managed in Admin → Exclusivity.
-- SALES_DB — apply to portal-db ONLY (shared by every environment, like the
-- publisher registry and webshop markets; apply SQL directly, not
-- `d1 migrations apply`).

CREATE TABLE IF NOT EXISTS exclusivity_deal (
	id           TEXT PRIMARY KEY,
	sku          TEXT NOT NULL,
	product_name TEXT,               -- snapshot at save; the page refreshes it from Sheets
	market       TEXT NOT NULL,      -- DK | SE | NO | INT | PL
	start_date   TEXT,               -- YYYY-MM-DD, NULL = from the start (already running)
	end_date     TEXT,               -- YYYY-MM-DD inclusive, NULL = open-ended
	note         TEXT,
	created_by   TEXT,
	created_at   TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_excl_deal_sku    ON exclusivity_deal (sku);
CREATE INDEX IF NOT EXISTS idx_excl_deal_market ON exclusivity_deal (market);

-- The customers an agreement is exclusive to: a whole customer group (kind =
-- 'group', ref = HubSpot customer_group name) or a single company (kind =
-- 'company', ref = HubSpot company id). `label` is the display name.
CREATE TABLE IF NOT EXISTS exclusivity_party (
	deal_id TEXT NOT NULL,
	kind    TEXT NOT NULL,
	ref     TEXT NOT NULL,
	label   TEXT,
	PRIMARY KEY (deal_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_excl_party_ref ON exclusivity_party (kind, ref);
