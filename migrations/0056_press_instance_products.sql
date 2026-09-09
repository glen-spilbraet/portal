-- Additional products on a press instance (beyond the main sku). The instance's
-- badge applies to all of them, exactly like the main product.
-- Apply to BOTH:
--   wrangler d1 execute portal-db     --remote --file=migrations/0056_press_instance_products.sql
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0056_press_instance_products.sql

CREATE TABLE IF NOT EXISTS press_instance_product (
  id          TEXT PRIMARY KEY,
  instance_id TEXT NOT NULL,
  sku         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_press_instance_product_instance ON press_instance_product(instance_id);
CREATE INDEX IF NOT EXISTS idx_press_instance_product_sku ON press_instance_product(sku);
