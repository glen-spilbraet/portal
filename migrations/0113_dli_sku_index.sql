-- deal_line_items had no index usable for a plain `sku = ?` lookup (the SKU
-- indexes lead with deal_kind / company_id). Mapping a SKU to a publisher or
-- series (REAPPLY_ONE / REAPPLY_SERIES_ONE: UPDATE … WHERE sku = ?) and the
-- publisher-mapping page's name fallback therefore scanned the whole table
-- (~600k rows) per SKU — seconds of database time per mapping click, during
-- which every other page waited (D1 runs one query at a time).
-- SALES_DB — apply to portal-db ONLY (apply SQL directly, not `d1 migrations apply`).
CREATE INDEX IF NOT EXISTS idx_dli_sku ON deal_line_items (sku);
