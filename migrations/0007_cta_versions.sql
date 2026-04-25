CREATE TABLE IF NOT EXISTS cta_versions (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS cta_version_translations (
  cta_id TEXT NOT NULL,
  lang TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cta_id, lang),
  FOREIGN KEY (cta_id) REFERENCES cta_versions(id) ON DELETE CASCADE
);

-- Migrate existing single CTA to first version
INSERT INTO cta_versions (id, name, sort_order) VALUES ('default', 'New Product', 0);
INSERT INTO cta_version_translations (cta_id, lang, value)
  SELECT 'default', lang, label FROM global_labels WHERE key = 'cta';

-- Add cta_version_id to sheets (NULL = no CTA shown)
ALTER TABLE sales_sheets ADD COLUMN cta_version_id TEXT REFERENCES cta_versions(id);
-- Set all existing sheets to 'default' version
UPDATE sales_sheets SET cta_version_id = 'default';
