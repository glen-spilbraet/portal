-- Task updates: a lightweight comment/activity feed shown in the task detail pane.
-- Lives in the per-env `DB` binding (portal-db / portal-db-dev).

CREATE TABLE IF NOT EXISTS task_updates (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL,
  author_email TEXT,
  body         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_updates_task ON task_updates(task_id);
