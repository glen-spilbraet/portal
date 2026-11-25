-- Company's Rackbeat customer number (HubSpot company property `rackbeat_id`)
-- on the sales mirror, so customer exports can carry it. Filled by the
-- hubspot-sales-sync worker; run ?reconcile=1 once to backfill old rows.
--
-- Apply to portal-db ONLY (sales tables live once, read via SALES_DB):
--   wrangler d1 execute portal-db --remote --file=migrations/0132_company_rackbeat_id.sql

ALTER TABLE sales_deals    ADD COLUMN company_rackbeat_id TEXT;
ALTER TABLE forecast_deals ADD COLUMN company_rackbeat_id TEXT;
