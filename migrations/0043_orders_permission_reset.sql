-- Orders moves from admin-only to a permission-set-controlled section.
-- The access_orders column (0019) defaulted to 1, but Orders was previously
-- gated to admins only, so no permission-set user actually had access. Reset
-- existing sets to OFF to preserve that; admins re-enable it per set as needed.
-- Apply to BOTH portal-db (prod) and portal-db-dev (dev):
--   wrangler d1 execute portal-db     --remote --file=migrations/0043_orders_permission_reset.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0043_orders_permission_reset.sql
UPDATE permission_sets SET access_orders = 0;
