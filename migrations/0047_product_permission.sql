-- Product view (publisher analytics) access permission.
-- Apply to BOTH app DBs:
--   wrangler d1 execute portal-db     --remote --file=migrations/0047_product_permission.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0047_product_permission.sql
ALTER TABLE permission_sets ADD COLUMN access_product INTEGER NOT NULL DEFAULT 0;
