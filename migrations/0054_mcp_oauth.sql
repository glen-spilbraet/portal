-- OAuth 2.1 (authorization-code + PKCE) state for the remote MCP server, so
-- claude.ai / Claude Desktop can connect as a custom connector. The portal is
-- the authorization server; auth codes/tokens are opaque and stored here.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0054_mcp_oauth.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0054_mcp_oauth.sql

CREATE TABLE IF NOT EXISTS mcp_oauth_client (
  client_id     TEXT PRIMARY KEY,
  client_name   TEXT,
  redirect_uris TEXT NOT NULL,                       -- JSON array of exact URIs
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_oauth_code (
  code           TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,                       -- PKCE S256 challenge
  email          TEXT NOT NULL,
  scope          TEXT,
  expires_at     INTEGER NOT NULL                     -- epoch seconds
);

CREATE TABLE IF NOT EXISTS mcp_oauth_token (
  access_token   TEXT PRIMARY KEY,
  refresh_token  TEXT,
  client_id      TEXT NOT NULL,
  email          TEXT NOT NULL,
  scope          TEXT,
  expires_at     INTEGER NOT NULL,                    -- epoch seconds
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mcp_token_refresh ON mcp_oauth_token(refresh_token);
