ALTER TABLE catalogues ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalogues_share_token ON catalogues(share_token) WHERE share_token IS NOT NULL;
