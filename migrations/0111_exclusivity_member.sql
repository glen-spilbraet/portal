-- Exclusivity: the resolved customers of each agreement (groups expanded to
-- their HubSpot companies) with their Rackbeat customer number — the shop
-- identifies customers by Rackbeat number. Filled from HubSpot when an
-- agreement is saved, and by "Refresh customers" in Admin → Exclusivity.
-- SALES_DB — apply to portal-db ONLY (apply SQL directly, not `d1 migrations apply`).

CREATE TABLE IF NOT EXISTS exclusivity_member (
	deal_id         TEXT NOT NULL,
	company_id      TEXT NOT NULL,   -- HubSpot company id
	company_name    TEXT,
	customer_number TEXT,            -- HubSpot company `rackbeat_id` (Rackbeat customer number); NULL = not set in HubSpot
	resolved_at     TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (deal_id, company_id)
);
