-- Award View update tracking (per product/sheet).
-- awards_updated_at = when the webshop was last updated with this sheet's press/awards
--   (NULL = never updated). "Needs update" = the sheet has a press/award instance
--   CREATED (press_instance.created_at) after awards_updated_at, or it was never updated.
ALTER TABLE sales_sheets ADD COLUMN awards_updated_at INTEGER;
