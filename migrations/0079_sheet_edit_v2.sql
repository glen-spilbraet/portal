-- Sales Sheet edit v2 (shared with the future webshop):
--  • long_description → a new per-language translation key (no schema change)
--  • multiple videos  → sheet_video (url + 16:9/9:16 orientation)
--  • flat box photo   → sales_sheets.box_flat_image_key (3D stays box_image_key)
--  • typed images     → sheet_images.type ('people_playing' default | 'content')
ALTER TABLE sales_sheets ADD COLUMN box_flat_image_key TEXT;
ALTER TABLE sheet_images ADD COLUMN type TEXT NOT NULL DEFAULT 'people_playing';

CREATE TABLE IF NOT EXISTS sheet_video (
	id            TEXT PRIMARY KEY,
	sheet_id      TEXT NOT NULL REFERENCES sales_sheets(id) ON DELETE CASCADE,
	url           TEXT NOT NULL,
	orientation   TEXT NOT NULL DEFAULT '16:9',  -- '16:9' | '9:16'
	display_order INTEGER NOT NULL DEFAULT 0,
	created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_sheet_video_sheet ON sheet_video(sheet_id);

-- Migrate the existing single youtube_url into the new videos list.
INSERT INTO sheet_video (id, sheet_id, url, orientation, display_order)
	SELECT lower(hex(randomblob(8))), id, youtube_url,
	       CASE WHEN youtube_url LIKE '%/shorts/%' THEN '9:16' ELSE '16:9' END, 0
	FROM sales_sheets WHERE youtube_url IS NOT NULL AND trim(youtube_url) != '';
