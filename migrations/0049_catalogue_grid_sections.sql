-- Grid section support for catalogue_items: a half-page section showing
-- a 2x2 (4) or 2x3 (6) grid of products.
ALTER TABLE catalogue_items ADD COLUMN section_grid_size INTEGER;
ALTER TABLE catalogue_items ADD COLUMN section_grid_items TEXT;
