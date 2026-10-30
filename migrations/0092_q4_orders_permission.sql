-- Q4 Orders tool: its own access flag on permission sets.
-- Applies to DB (portal-db in prod, portal-db-dev in preview) — run against BOTH.
ALTER TABLE permission_sets ADD COLUMN access_q4_orders INTEGER DEFAULT 0;
