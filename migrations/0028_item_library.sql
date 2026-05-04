CREATE TABLE IF NOT EXISTS item_library (
  id         TEXT    PRIMARY KEY,
  sku        TEXT    NOT NULL,
  name       TEXT,
  width_cm   REAL    NOT NULL DEFAULT 10,
  height_cm  REAL    NOT NULL DEFAULT 10,
  photo_key  TEXT,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_item_library_sku ON item_library(sku);
