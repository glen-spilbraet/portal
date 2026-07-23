-- Sales Stats dashboard access permission.
-- Apply to BOTH portal-db (prod) and portal-db-dev (dev):
--   wrangler d1 execute portal-db     --remote --file=migrations/0037_stats_permission.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0037_stats_permission.sql
ALTER TABLE permission_sets ADD COLUMN access_stats INTEGER NOT NULL DEFAULT 0;
