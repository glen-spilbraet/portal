-- Rackbeat stock on the Sales Sheet (read-only mirror, Rackbeat is master).
-- Written hourly by the hubspot-sales-sync worker straight into sales_sheets —
-- it never touches updated_at, so the webshop feed doesn't see stock changes as
-- content edits. NULL = SKU not found in Rackbeat (or not synced yet).
-- Per-environment table: apply to BOTH portal-db and portal-db-dev
-- (apply SQL directly, not `d1 migrations apply`).

ALTER TABLE sales_sheets ADD COLUMN rb_available INTEGER; -- Rackbeat available_quantity ("Til rådighed")
ALTER TABLE sales_sheets ADD COLUMN rb_stock     INTEGER; -- stock_quantity ("Beholdning")
ALTER TABLE sales_sheets ADD COLUMN rb_in_order  INTEGER; -- in_order_quantity ("I ordre")
ALTER TABLE sales_sheets ADD COLUMN rb_purchased INTEGER; -- purchased_quantity ("Bestilt", on open POs)
ALTER TABLE sales_sheets ADD COLUMN rb_changed_at TEXT;   -- ISO time the values last changed

-- Last run of the stock sync (one row, id = 1) — the "as of" time for every sheet.
CREATE TABLE IF NOT EXISTS rb_sync_meta (
  id        INTEGER PRIMARY KEY,
  last_run  TEXT,
  status    TEXT,
  message   TEXT,
  products  INTEGER,
  matched   INTEGER,
  changed   INTEGER
);
