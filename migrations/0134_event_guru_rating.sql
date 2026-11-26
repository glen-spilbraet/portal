-- 0134_event_guru_rating.sql — Gurus are rated per event (1–5 stars) instead of
-- one fixed rating. The guru card shows the average across rated events.
-- The old fixed rating (guru.rating) is retired: cleared and no longer used.
-- Per-env DB (DB binding): apply to portal-db-dev and portal-db.
ALTER TABLE event_guru ADD COLUMN rating INTEGER;
UPDATE guru SET rating = NULL;
