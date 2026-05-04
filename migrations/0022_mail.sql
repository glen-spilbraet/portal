CREATE TABLE IF NOT EXISTS key_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  key_account_id TEXT REFERENCES key_accounts(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

ALTER TABLE permission_sets ADD COLUMN access_mail INTEGER DEFAULT 0;
