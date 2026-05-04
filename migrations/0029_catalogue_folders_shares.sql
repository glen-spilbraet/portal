-- Multi-level folder structure for catalogues
CREATE TABLE IF NOT EXISTS catalogue_folders (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  parent_id  TEXT    REFERENCES catalogue_folders(id) ON DELETE CASCADE,
  created_by TEXT    NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_cat_folders_parent ON catalogue_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_cat_folders_owner  ON catalogue_folders(created_by);

-- Tie catalogues to folders (NULL = root level)
ALTER TABLE catalogues ADD COLUMN folder_id TEXT REFERENCES catalogue_folders(id) ON DELETE SET NULL;

-- User-to-user catalogue sharing
CREATE TABLE IF NOT EXISTS catalogue_shares (
  id                TEXT    PRIMARY KEY,
  catalogue_id      TEXT    NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
  shared_with_email TEXT    NOT NULL,
  shared_by_email   TEXT    NOT NULL,
  shared_at         INTEGER DEFAULT (unixepoch()),
  UNIQUE(catalogue_id, shared_with_email)
);
CREATE INDEX IF NOT EXISTS idx_cat_shares_catalogue ON catalogue_shares(catalogue_id);
CREATE INDEX IF NOT EXISTS idx_cat_shares_recipient ON catalogue_shares(shared_with_email);
