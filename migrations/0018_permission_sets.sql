CREATE TABLE IF NOT EXISTS permission_sets (
  id          TEXT    PRIMARY KEY,
  name        TEXT    NOT NULL,
  access_sheets      INTEGER NOT NULL DEFAULT 1,
  access_catalogues  INTEGER NOT NULL DEFAULT 1,
  access_planograms  INTEGER NOT NULL DEFAULT 1,
  access_data        INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

ALTER TABLE allowed_users ADD COLUMN permission_set_id TEXT;
