CREATE TABLE IF NOT EXISTS sales_sheets (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  box_image_key TEXT,
  data_fields TEXT NOT NULL DEFAULT '[]',
  usp_count INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- data_fields is a JSON array: [{key, label, value}]
-- e.g. [{"key":"sku","label":"SKU","value":"PROD-001"},{"key":"ean","label":"EAN","value":"5700123456789"}]

CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  UNIQUE(sheet_id, language, key)
);

-- translation keys: product_name, usp_1..usp_6

CREATE TABLE IF NOT EXISTS sheet_images (
  id TEXT PRIMARY KEY,
  sheet_id TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  crop_x REAL NOT NULL DEFAULT 50,
  crop_y REAL NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_translations_sheet ON translations(sheet_id, language);
CREATE INDEX IF NOT EXISTS idx_images_sheet ON sheet_images(sheet_id, display_order);
