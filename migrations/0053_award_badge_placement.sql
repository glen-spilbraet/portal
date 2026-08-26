-- Badge placement config on a media (how its badges sit on a product box).
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0053_award_badge_placement.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0053_award_badge_placement.sql
ALTER TABLE award_media ADD COLUMN badge_placement TEXT NOT NULL DEFAULT 'bottom-right'; -- top-left|top-right|bottom-left|bottom-right
ALTER TABLE award_media ADD COLUMN badge_pad_x     INTEGER NOT NULL DEFAULT 1;           -- left/right padding on?
ALTER TABLE award_media ADD COLUMN badge_pad_y     INTEGER NOT NULL DEFAULT 1;           -- top/bottom padding on?
ALTER TABLE award_media ADD COLUMN badge_size_pct  REAL NOT NULL DEFAULT 15;             -- badge width as % of box
ALTER TABLE award_media ADD COLUMN badge_pad_pct   REAL NOT NULL DEFAULT 3;              -- padding as % of box (when on)
