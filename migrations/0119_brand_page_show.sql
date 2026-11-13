-- 0119_brand_page_show.sql — "Show in shop" toggle per publisher / series
-- landing page. Off by default: the shop only builds pages switched on.
-- SALES_DB / portal-db only (shared by dev + prod).
ALTER TABLE brand_page ADD COLUMN show_in_shop INTEGER NOT NULL DEFAULT 0;
