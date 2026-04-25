-- Planogram projects
CREATE TABLE IF NOT EXISTS planogram_projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Untitled project',
  settings TEXT NOT NULL DEFAULT '{}',
  placements TEXT NOT NULL DEFAULT '[]',
  share_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Library items (products / placeholders) belonging to a project
CREATE TABLE IF NOT EXISTS planogram_library_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES planogram_projects(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  name TEXT,
  width_cm REAL NOT NULL DEFAULT 10,
  height_cm REAL NOT NULL DEFAULT 10,
  is_placeholder INTEGER NOT NULL DEFAULT 1,
  photo_key TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_planogram_items_project ON planogram_library_items(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planogram_share_token ON planogram_projects(share_token) WHERE share_token IS NOT NULL;
