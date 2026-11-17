-- Marketing wheel (hidden /wheel tool, admin-only): yearly week-by-week planning.
-- Lives in the per-env `DB` binding — apply to BOTH portal-db and portal-db-dev.

-- Adjustable activity list (B2C Newsletter, Website Article, …).
CREATE TABLE IF NOT EXISTS wheel_activities (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#F57832',
  position   INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A planned instance: one product / series / publisher in one ISO week.
CREATE TABLE IF NOT EXISTS wheel_items (
  id         TEXT PRIMARY KEY,
  year       INTEGER NOT NULL,
  week       INTEGER NOT NULL,          -- ISO week 1..53
  kind       TEXT NOT NULL,             -- product (sku) | series (series.id) | publisher (name)
  ref_id     TEXT NOT NULL,
  ref_label  TEXT,                      -- cached display label
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_wheel_items_year ON wheel_items(year, week);

CREATE TABLE IF NOT EXISTS wheel_item_activities (
  item_id     TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  PRIMARY KEY (item_id, activity_id)
);

-- Themes spanning a range of weeks, drawn as arcs outside the wheel.
CREATE TABLE IF NOT EXISTS wheel_themes (
  id          TEXT PRIMARY KEY,
  year        INTEGER NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#17834F',
  start_week  INTEGER NOT NULL,
  end_week    INTEGER NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_by  TEXT
);
CREATE INDEX IF NOT EXISTS idx_wheel_themes_year ON wheel_themes(year);

INSERT OR IGNORE INTO wheel_activities (id, name, color, position) VALUES
  ('act-b2c-newsletter', 'B2C Newsletter',      '#F57832', 0),
  ('act-web-article',    'Website Article',     '#2563EB', 1),
  ('act-xmas-catalogue', 'Christmas Catalogue', '#DC2626', 2);
