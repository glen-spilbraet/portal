-- Forecast Stats view access permission.
-- Apply to BOTH app DBs (bookkeeping stale — do NOT use `migrations apply`):
--   wrangler d1 execute portal-db     --remote --file=migrations/0048_forecast_permission.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0048_forecast_permission.sql
ALTER TABLE permission_sets ADD COLUMN access_forecast INTEGER NOT NULL DEFAULT 0;
