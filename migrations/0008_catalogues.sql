CREATE TABLE IF NOT EXISTS catalogues (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'en',
  title TEXT NOT NULL DEFAULT '',
  logo_key TEXT,
  logo_bg_color TEXT NOT NULL DEFAULT '#FFFFFF',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS catalogue_items (
  id TEXT NOT NULL PRIMARY KEY,
  catalogue_id TEXT NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
  sheet_id TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0
);
