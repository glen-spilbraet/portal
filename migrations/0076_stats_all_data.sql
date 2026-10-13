-- Sales Stats gains a second level: "all data" (every owner's deals), vs the
-- default "own data" (the user's own customers). access_stats stays the on/off
-- for the Stats section; access_stats_all additionally unlocks all-owner data
-- (dashboard rep filter + owner breakdown, and full sales MCP). Existing sets
-- keep their current behaviour: access_stats=1 → own data (all=0).
ALTER TABLE permission_sets ADD COLUMN access_stats_all INTEGER NOT NULL DEFAULT 0;
