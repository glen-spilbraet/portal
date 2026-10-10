-- Let viewers change the date range on the shared report (admin opt-in).
ALTER TABLE report ADD COLUMN allow_date_filter INTEGER NOT NULL DEFAULT 0;
