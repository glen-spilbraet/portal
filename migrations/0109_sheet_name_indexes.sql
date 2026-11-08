-- Product-name lookups (`lower(s.sku) IN (…)` + translations.key) used by
-- reports, exclusivity, warehouse and the shop feed: lower() disabled the SKU
-- index, so each lookup scanned sheets + translations (~83k rows for 15 SKUs).
-- App tables — apply to BOTH:
--   npx wrangler d1 execute portal-db     --remote --file=migrations/0109_sheet_name_indexes.sql
--   npx wrangler d1 execute portal-db-dev --remote --file=migrations/0109_sheet_name_indexes.sql
-- Index-only: no data changes.
CREATE INDEX IF NOT EXISTS idx_sales_sheets_sku_lower ON sales_sheets (lower(sku));
CREATE INDEX IF NOT EXISTS idx_translations_sheet_key ON translations (sheet_id, key);
