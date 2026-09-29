-- 0060_event_currency.sql — currency for the event entry fee.
ALTER TABLE event ADD COLUMN entry_fee_currency TEXT NOT NULL DEFAULT 'DKK';
