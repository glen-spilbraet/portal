CREATE TABLE IF NOT EXISTS campaign_send_log (
  id          TEXT    PRIMARY KEY,
  campaign_id TEXT    NOT NULL REFERENCES campaigns(id)  ON DELETE CASCADE,
  contact_id  TEXT    NOT NULL REFERENCES contacts(id)   ON DELETE CASCADE,
  sent_at     INTEGER DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_send_log_campaign ON campaign_send_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_log_contact  ON campaign_send_log(contact_id);
