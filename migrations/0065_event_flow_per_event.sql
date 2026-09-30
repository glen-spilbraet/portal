-- 0065_event_flow_per_event.sql — email-flow inclusion is PER EVENT, not global.
-- The old global guru.in_email_flow / venue_contact.in_email_flow columns are
-- left in place but no longer used.
ALTER TABLE event_guru    ADD COLUMN in_email_flow INTEGER NOT NULL DEFAULT 1;
ALTER TABLE event_contact ADD COLUMN in_email_flow INTEGER NOT NULL DEFAULT 1;
