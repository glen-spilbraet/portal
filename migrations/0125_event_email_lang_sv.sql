-- Event e-mail templates stored Swedish as `se`; the rest of the Portal (product
-- texts, categories, the shop feed) uses `sv`. Rename the old rows. A step that
-- already has an `sv` row (saved after the code change) keeps it; its stale
-- `se` row is dropped.
--
-- App DB (DB binding): apply to portal-db-dev and portal-db. Safe to run more
-- than once. The code reads both spellings, so there is no ordering constraint
-- between this migration and the deploy.
DELETE FROM event_email_template
 WHERE lang = 'se'
   AND EXISTS (SELECT 1 FROM event_email_template t2 WHERE t2.step_id = event_email_template.step_id AND t2.lang = 'sv');
UPDATE event_email_template SET lang = 'sv' WHERE lang = 'se';
