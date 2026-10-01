-- 0066_publisher_registry.sql — canonical publisher registry (on the shared
-- SALES_DB / portal-db, so dev + prod see one identical list). Lets us pick an
-- existing publisher or create one that has no SKU prefix yet (e.g. Magilano).
-- The per-SKU mapping itself stays in product_publisher_override.

CREATE TABLE IF NOT EXISTS publisher (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL UNIQUE,
	created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Seed from the names already in use (prefix map + per-SKU overrides).
INSERT OR IGNORE INTO publisher (id, name)
	SELECT lower(hex(randomblob(8))), publisher FROM publisher_prefix
	WHERE publisher IS NOT NULL AND trim(publisher) != '';
INSERT OR IGNORE INTO publisher (id, name)
	SELECT lower(hex(randomblob(8))), publisher FROM product_publisher_override
	WHERE publisher IS NOT NULL AND trim(publisher) != '';
