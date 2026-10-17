-- 0079_categories.sql — product categories (tags) for the B2B shop filter.
-- On the shared SALES_DB (prod portal-db) like the publisher registry, so dev
-- and prod Portal edit one list. Apply with:
--   wrangler d1 execute portal-db --remote --file=migrations/0079_categories.sql
--
--   category_group  e.g. "Game type"
--   category        e.g. "Strategy" (belongs to one group)
--   category_label  the name per language (da, sv, no, en, pl)
--   product_category which categories a SKU has

CREATE TABLE IF NOT EXISTS category_group (
	id         TEXT PRIMARY KEY,
	position   INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category (
	id         TEXT PRIMARY KEY,
	group_id   TEXT NOT NULL REFERENCES category_group(id) ON DELETE CASCADE,
	position   INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_category_group ON category(group_id, position);

-- object_type: 'group' | 'category'
CREATE TABLE IF NOT EXISTS category_label (
	object_type TEXT NOT NULL,
	object_id   TEXT NOT NULL,
	language    TEXT NOT NULL,
	label       TEXT NOT NULL,
	PRIMARY KEY (object_type, object_id, language)
);

CREATE TABLE IF NOT EXISTS product_category (
	sku         TEXT NOT NULL,
	category_id TEXT NOT NULL REFERENCES category(id) ON DELETE CASCADE,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	created_by  TEXT,
	PRIMARY KEY (sku, category_id)
);
CREATE INDEX IF NOT EXISTS idx_product_category_cat ON product_category(category_id);
