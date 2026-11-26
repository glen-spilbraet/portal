-- 0135_event_guru_note.sql — Internal note on a guru's performance at one event
-- (sits next to the per-event rating from 0134).
-- Per-env DB (DB binding): apply to portal-db-dev and portal-db.
ALTER TABLE event_guru ADD COLUMN rating_note TEXT;
