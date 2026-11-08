-- Custom reports: optional "Initiatives" pane on the shared report (awards,
-- press and events for the report's products). App DB — apply to BOTH:
--   npx wrangler d1 execute portal-db-dev --remote --file=migrations/0107_report_initiatives.sql
--   npx wrangler d1 execute portal-db     --remote --file=migrations/0107_report_initiatives.sql
ALTER TABLE report ADD COLUMN show_initiatives INTEGER NOT NULL DEFAULT 0;
