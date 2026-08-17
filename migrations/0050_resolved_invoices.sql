-- Verification invoice cache. Once a deal's Rackbeat invoice is resolved (by
-- order_number, or by invoice number for IN-/CN- refs), we store its figures
-- here keyed by the deal's rackbeat_id. Verification then compares locally with
-- zero Rackbeat calls for already-resolved deals. Rackbeat invoices are
-- immutable once booked, so cached figures stay valid.
-- Apply to portal-db (SALES_DB, shared by all envs):
--   wrangler d1 execute portal-db --remote --file=migrations/0050_resolved_invoices.sql
CREATE TABLE IF NOT EXISTS resolved_invoices (
	rackbeat_id     TEXT PRIMARY KEY,   -- the deal's rackbeat_id (order no, or IN-/CN- ref)
	invoice_numbers TEXT,               -- comma-joined invoice number(s) for the order
	subtotal        REAL,               -- summed total_subtotal across the order's invoices
	invoice_dates   TEXT,               -- comma-joined invoice_date(s)
	currency        TEXT,
	currency_rate   REAL,
	resolved_at     TEXT
);
