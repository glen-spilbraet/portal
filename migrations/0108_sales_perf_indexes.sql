-- Speed-ups for the heaviest prod queries (from `wrangler d1 insights`).
-- SALES tables — apply to portal-db ONLY (shared SALES_DB; apply SQL directly):
--   npx wrangler d1 execute portal-db --remote --file=migrations/0108_sales_perf_indexes.sql
-- Index-only: no data changes.

-- Credit notes are deals whose rackbeat_id starts with "CN-". With this index
-- the credit-note report reads only those deals (+ their lines via
-- idx_dli_deal) instead of every sales line in history (~577k rows, ~4 s).
CREATE INDEX IF NOT EXISTS idx_sales_deals_rackbeat ON sales_deals (rackbeat_id);

-- Publisher reports filter on (deal_kind, publisher) AND a close_date range;
-- the old (deal_kind, publisher) index read the publisher's whole history.
CREATE INDEX IF NOT EXISTS idx_dli_kind_pub_close ON deal_line_items (deal_kind, publisher, close_date);
