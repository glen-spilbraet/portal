-- Awards & Press refinements: explicit "nominated" flag (so a pure press
-- statement is distinct from a nomination) + one nominee badge and one winner
-- badge image (PNG/SVG in R2) per instance.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0052_awards_badges_nominated.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0052_awards_badges_nominated.sql
ALTER TABLE press_instance ADD COLUMN is_nominated       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE press_instance ADD COLUMN nominee_badge_key  TEXT;
ALTER TABLE press_instance ADD COLUMN winner_badge_key   TEXT;

-- Existing rows with an award category were nominations.
UPDATE press_instance SET is_nominated = 1 WHERE award_category IS NOT NULL AND TRIM(award_category) != '';
