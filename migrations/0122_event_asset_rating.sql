-- 0122_event_asset_rating.sql — Internal quality rating on event photos/video.
-- NULL = not rated; otherwise 'good' | 'semi' | 'bad'.
-- Apply to BOTH portal-db-dev and portal-db (DB binding, per environment).
ALTER TABLE event_asset ADD COLUMN rating TEXT;
