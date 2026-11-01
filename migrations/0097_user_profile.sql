-- Profile per Portal user (/profile): photo, phone and title, kept by the user.
-- Shown to their customers in the B2B shop ("Din sælger"), matched by email
-- with Rackbeat's "Vores reference" (feed: /api/shop/reps).
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0097_user_profile.sql
--   wrangler d1 execute portal-db --remote --file=migrations/0097_user_profile.sql
ALTER TABLE allowed_users ADD COLUMN phone TEXT;
ALTER TABLE allowed_users ADD COLUMN job_title TEXT;
ALTER TABLE allowed_users ADD COLUMN photo_key TEXT;            -- R2 (IMAGES) key, profiles/<uuid>.jpg
ALTER TABLE allowed_users ADD COLUMN profile_updated_at TEXT;
