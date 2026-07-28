-- HubSpot Deal's `rackbeat_id` — links a deal to its Rackbeat order/invoice/
-- credit note, used to verify amount & close date against Rackbeat.
--   plain value  → Rackbeat order (→ its invoice)
--   'IN-<number>'→ exact invoice number
--   'CN-<number>'→ exact credit note number
ALTER TABLE sales_deals ADD COLUMN rackbeat_id TEXT;
