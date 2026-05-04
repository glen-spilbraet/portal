CREATE TABLE IF NOT EXISTS allowed_users (
  email TEXT PRIMARY KEY,
  role  TEXT NOT NULL DEFAULT 'user',
  name  TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed your own admin account — replace with your actual Google email address:
-- INSERT OR IGNORE INTO allowed_users (email, role) VALUES ('you@example.com', 'admin');
