-- Secondary badge corner + per-side padding for a media outlet.
--
-- Secondary corner: when a product already has a badge in the primary corner, a
-- newer badge falls back here; if both corners are taken the badge isn't shown.
-- NULL = no secondary (primary only).
--
-- Per-side padding (% of box): only the two sides matching a badge's corner are
-- used — e.g. a bottom-right badge uses bottom + right. Backfilled from the old
-- axis-toggle model so existing badges keep their current position.
ALTER TABLE award_media ADD COLUMN badge_placement_2 TEXT;
ALTER TABLE award_media ADD COLUMN badge_pad_top    REAL NOT NULL DEFAULT 3;
ALTER TABLE award_media ADD COLUMN badge_pad_right  REAL NOT NULL DEFAULT 3;
ALTER TABLE award_media ADD COLUMN badge_pad_bottom REAL NOT NULL DEFAULT 3;
ALTER TABLE award_media ADD COLUMN badge_pad_left   REAL NOT NULL DEFAULT 3;
UPDATE award_media SET
	badge_pad_top    = CASE WHEN badge_pad_y = 1 THEN badge_pad_pct ELSE 0 END,
	badge_pad_bottom = CASE WHEN badge_pad_y = 1 THEN badge_pad_pct ELSE 0 END,
	badge_pad_left   = CASE WHEN badge_pad_x = 1 THEN badge_pad_pct ELSE 0 END,
	badge_pad_right  = CASE WHEN badge_pad_x = 1 THEN badge_pad_pct ELSE 0 END;
