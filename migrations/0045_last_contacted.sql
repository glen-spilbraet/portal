-- "Last Contacted" from HubSpot (company property notes_last_contacted), stored
-- per deal row (company-level value, denormalised like country/owner). Backfilled
-- by re-sync. Lives in the shared SALES_DB (portal-db):
--   wrangler d1 execute portal-db --remote --file=migrations/0045_last_contacted.sql
ALTER TABLE sales_deals ADD COLUMN last_contacted TEXT;
