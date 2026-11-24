-- Rackbeat "barred" (spærret) flag on the Sales Sheet — read-only mirror, Rackbeat
-- is master. Written hourly by the hubspot-sales-sync worker (with the stock).
-- 1 = barred in Rackbeat, 0 = not barred, NULL = SKU not in Rackbeat / not synced.
-- Per-environment: apply to BOTH portal-db and portal-db-dev
-- (apply SQL directly, not `d1 migrations apply`).

ALTER TABLE sales_sheets ADD COLUMN rb_barred INTEGER;
