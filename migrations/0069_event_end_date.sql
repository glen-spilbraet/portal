-- Optional end date for multi-day events (event_date = start date). NULL = single-day.
ALTER TABLE event ADD COLUMN end_date TEXT;
