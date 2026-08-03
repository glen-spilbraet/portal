-- Add currency-rate verification to the HubSpot ↔ Rackbeat check.
-- hs_rate = deal amount_in_home_currency / amount (DKK per unit of deal currency);
-- rb_rate = Rackbeat invoice currency_rate; rb_currency = invoice currency code.
-- These tables live in the shared SALES_DB (portal-db):
--   wrangler d1 execute portal-db --remote --file=migrations/0044_verification_currency.sql
ALTER TABLE verification_issues ADD COLUMN hs_rate REAL;
ALTER TABLE verification_issues ADD COLUMN rb_rate REAL;
ALTER TABLE verification_issues ADD COLUMN rb_currency TEXT;
ALTER TABLE verification_issues ADD COLUMN rate_match INTEGER;
ALTER TABLE verification_meta ADD COLUMN rate_mismatch INTEGER;
