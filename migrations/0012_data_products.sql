CREATE TABLE IF NOT EXISTS data_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_key TEXT,
  template_headers TEXT NOT NULL DEFAULT '[]',
  mappings TEXT NOT NULL DEFAULT '{}',
  skus TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
