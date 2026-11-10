-- "Featured" star on Sales Sheets, exposed in the webshop feed (featured /
-- featured_at) so the shops can show Featured Products. NULL = not featured;
-- the timestamp lets the shop order featured products newest-starred first.
-- App DB — apply to BOTH:
--   npx wrangler d1 execute portal-db-dev --remote --file=migrations/0110_sheet_featured.sql
--   npx wrangler d1 execute portal-db     --remote --file=migrations/0110_sheet_featured.sql
ALTER TABLE sales_sheets ADD COLUMN featured_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sales_sheets_featured ON sales_sheets (featured_at) WHERE featured_at IS NOT NULL;
