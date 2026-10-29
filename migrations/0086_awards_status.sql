-- Awards & Press: a per-entry status, so a whole submission batch can be tracked.
-- Award track: submitted → nominated → winner (winner implies nominated).
-- Press track: sent / used / not_used. The track is implied by the value, so one
-- media can host both. is_nominated/is_winner are kept in sync from status (badges).
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0086_awards_status.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0086_awards_status.sql
ALTER TABLE press_instance ADD COLUMN status TEXT;

-- Backfill existing award rows from their flags. Press/statement-only rows stay
-- NULL (shown as "—") and get a status set in the UI as needed.
UPDATE press_instance SET status = 'winner'    WHERE is_winner = 1;
UPDATE press_instance SET status = 'nominated' WHERE is_winner = 0 AND is_nominated = 1;
