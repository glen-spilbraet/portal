-- Stats → Product (one publisher, SKU view) filters closed lines by the
-- publisher's SKU prefixes within a date range. With only (sku_prefix) and
-- (deal_kind, close_date) indexes, each of the page's queries read every closed
-- line (~300k) — 3–7 s per uncached publisher page, blocking other pages.
-- SALES_DB — apply to portal-db ONLY (apply SQL directly, not `d1 migrations apply`).
CREATE INDEX IF NOT EXISTS idx_dli_kind_prefix_close ON deal_line_items (deal_kind, sku_prefix, close_date);
