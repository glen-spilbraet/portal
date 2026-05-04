-- Multi-level folder structure for planograms
CREATE TABLE IF NOT EXISTS planogram_folders (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  parent_id  TEXT    REFERENCES planogram_folders(id) ON DELETE CASCADE,
  created_by TEXT    NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_plan_folders_parent ON planogram_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_plan_folders_owner  ON planogram_folders(created_by);

-- Tie planogram projects to folders (NULL = root level)
ALTER TABLE planogram_projects ADD COLUMN folder_id TEXT REFERENCES planogram_folders(id) ON DELETE SET NULL;

-- User-to-user planogram sharing
CREATE TABLE IF NOT EXISTS planogram_shares (
  id                TEXT    PRIMARY KEY,
  project_id        TEXT    NOT NULL REFERENCES planogram_projects(id) ON DELETE CASCADE,
  shared_with_email TEXT    NOT NULL,
  shared_by_email   TEXT    NOT NULL,
  shared_at         INTEGER DEFAULT (unixepoch()),
  UNIQUE(project_id, shared_with_email)
);
CREATE INDEX IF NOT EXISTS idx_plan_shares_project   ON planogram_shares(project_id);
CREATE INDEX IF NOT EXISTS idx_plan_shares_recipient ON planogram_shares(shared_with_email);
