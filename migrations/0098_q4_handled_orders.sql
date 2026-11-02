-- Rackbeat draft order numbers the Q4 Orders tool has already transferred, so
-- they drop out of the assessment list and don't reappear. DB binding.
CREATE TABLE IF NOT EXISTS q4_handled_orders (
  order_number TEXT PRIMARY KEY,
  handled_at   TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by   TEXT
);
