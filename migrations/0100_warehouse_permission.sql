-- Warehouse dashboard (Orders → Warehouse): its own access flag on permission
-- sets. Applies to DB (portal-db in prod, portal-db-dev in preview) — run
-- against BOTH. Apply SQL directly, do NOT use d1 migrations apply.
ALTER TABLE permission_sets ADD COLUMN access_warehouse INTEGER DEFAULT 0;
