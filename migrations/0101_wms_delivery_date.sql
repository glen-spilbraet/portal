-- Capture the order's requested delivery date. Orders WITH a delivery_date are
-- "Date Orders" (scheduled for a future day) and are excluded from the
-- handling-time estimate. DB binding — apply to BOTH portal-db and
-- portal-db-dev (apply SQL directly, not `d1 migrations apply`).
ALTER TABLE wms_orders ADD COLUMN delivery_date TEXT;
