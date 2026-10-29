-- Backfill: existing press entries that have at least one review statement and
-- no status yet → 'used'. Only rows whose status is still NULL/blank are touched,
-- so award statuses (submitted/nominated/winner) are preserved. Idempotent.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0087_awards_backfill_used.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0087_awards_backfill_used.sql
UPDATE press_instance
SET status = 'used'
WHERE (status IS NULL OR TRIM(status) = '')
  AND EXISTS (SELECT 1 FROM award_statement s WHERE s.instance_id = press_instance.id);
