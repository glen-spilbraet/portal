-- Task management (hidden /tasks tool): boards, tasks, task↔entity associations.
-- Lives in the per-env `DB` binding (portal-db / portal-db-dev).

CREATE TABLE IF NOT EXISTS task_boards (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  view_type  TEXT NOT NULL DEFAULT 'table',   -- room for future view types in the left list
  position   INTEGER NOT NULL DEFAULT 0,
  archived   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  board_id       TEXT NOT NULL,
  name           TEXT NOT NULL DEFAULT '',
  description    TEXT,
  status         TEXT NOT NULL DEFAULT 'not_started',  -- not_started|working|stuck|waiting_approval|done
  priority       TEXT NOT NULL DEFAULT 'medium',       -- low|medium|high|critical
  due_date       TEXT,                                 -- YYYY-MM-DD
  assignee_email TEXT,                                 -- allowed_users.email
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  created_by     TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id);

CREATE TABLE IF NOT EXISTS task_associations (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,          -- 'product' (sku) | 'customer' (company_id) | 'event' (event.id)
  ref_id     TEXT NOT NULL,
  ref_label  TEXT,                   -- cached display label so the board renders without cross-joins
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_assoc_task ON task_associations(task_id);
