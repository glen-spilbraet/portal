-- Marks whether the current 3D box image was produced by the new box cropper
-- (square + padding, shadow-preserving) vs an older/legacy upload. 0 = legacy/
-- unknown, 1 = made the new way. Lets us later list/filter old box photos.
-- App DB (DB): portal-db (prod) + portal-db-dev (preview).
ALTER TABLE sales_sheets ADD COLUMN box_processed INTEGER NOT NULL DEFAULT 0;
