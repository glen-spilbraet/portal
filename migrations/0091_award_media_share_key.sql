-- Per-media asset library: a short, unguessable key for the public share URL
-- /media/[name-slug]/[share_key]. Awards data lives in DB (per-env), apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0091_award_media_share_key.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0091_award_media_share_key.sql
ALTER TABLE award_media ADD COLUMN share_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_award_media_share_key ON award_media(share_key);
