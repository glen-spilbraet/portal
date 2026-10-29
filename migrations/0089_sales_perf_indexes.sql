-- Stats performance indexes (quick win S1). The sales tables live in SALES_DB,
-- which is ALWAYS the prod portal-db (shared by every environment), so this
-- only needs to run against portal-db:
--   wrangler d1 execute portal-db --remote --file=migrations/0089_sales_perf_indexes.sql
--
-- What each index unblocks:
--  * idx_dli_kind_close — breakdown queries filter deal_kind='closed' and sum
--    over close-date windows; lets the planner walk only closed rows (skip the
--    forecast rows) and range-scan by date instead of a full table scan.
--  * idx_dli_kind_sku   — product/SKU breakdowns (GROUP BY sku over closed rows).
--  * idx_sales_deals_company — the customer modal + the new /customer/[id] page
--    look up a single company_id in sales_deals, which had no company index.
--    (deal_line_items already has idx_dli_company for its company_id lookups.)
CREATE INDEX IF NOT EXISTS idx_dli_kind_close    ON deal_line_items(deal_kind, close_date);
CREATE INDEX IF NOT EXISTS idx_dli_kind_sku      ON deal_line_items(deal_kind, sku);
CREATE INDEX IF NOT EXISTS idx_sales_deals_company ON sales_deals(company_id);
