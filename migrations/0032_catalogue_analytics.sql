-- Catalogue share-link analytics

CREATE TABLE IF NOT EXISTS catalogue_analytics_sessions (
  id          TEXT    PRIMARY KEY,
  catalogue_id TEXT   NOT NULL,
  device_type TEXT    NOT NULL DEFAULT 'Unknown',
  city        TEXT,
  country     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS catalogue_analytics_events (
  id          TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL,
  event_type  TEXT    NOT NULL,  -- view_page | download_photos | download_excel | download_pdf | view_end
  page        INTEGER,           -- only set for view_page events
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_analytics_sessions_catalogue ON catalogue_analytics_sessions (catalogue_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON catalogue_analytics_events (session_id, created_at ASC);
