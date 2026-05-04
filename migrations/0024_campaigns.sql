CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS campaign_sheets (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  sheet_id    TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
  added_at    INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (campaign_id, sheet_id)
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  added_at    INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (campaign_id, contact_id)
);
