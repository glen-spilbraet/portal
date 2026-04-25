-- Add image section support to catalogue_items
-- Recreates the table with nullable sheet_id and new section columns

CREATE TABLE catalogue_items_new (
  id TEXT NOT NULL PRIMARY KEY,
  catalogue_id TEXT NOT NULL REFERENCES catalogues(id) ON DELETE CASCADE,
  sheet_id TEXT REFERENCES sales_sheets(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL DEFAULT 'sheet',
  section_image_key TEXT,
  section_crop_x REAL NOT NULL DEFAULT 50,
  section_crop_y REAL NOT NULL DEFAULT 50
);

INSERT INTO catalogue_items_new (id, catalogue_id, sheet_id, display_order)
  SELECT id, catalogue_id, sheet_id, display_order FROM catalogue_items;

DROP TABLE catalogue_items;
ALTER TABLE catalogue_items_new RENAME TO catalogue_items;
