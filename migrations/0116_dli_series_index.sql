-- Series pages (Stats → Product → a series, and the "Mapped series" view)
-- filter closed lines by series_id + date. With only (series_id) and
-- (deal_kind, close_date), SQLite picked the date index and checked series_id
-- per line (~170–530k rows per query). This one serves the filter directly.
-- SALES_DB — apply to portal-db ONLY (apply SQL directly, not `d1 migrations apply`).
CREATE INDEX IF NOT EXISTS idx_dli_series_kind_close ON deal_line_items (series_id, deal_kind, close_date);
