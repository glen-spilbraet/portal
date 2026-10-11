-- Reusable tags (created-on-use) + customer-group links for knowledge items.
CREATE TABLE IF NOT EXISTS tag (
	id   TEXT PRIMARY KEY,
	name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS knowledge_tag (
	item_id TEXT NOT NULL,
	tag_id  TEXT NOT NULL,
	PRIMARY KEY (item_id, tag_id)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_tag_tag ON knowledge_tag(tag_id);
-- Link a knowledge item to one or more customer groups (HubSpot customer_group).
CREATE TABLE IF NOT EXISTS knowledge_customer_group (
	item_id        TEXT NOT NULL,
	customer_group TEXT NOT NULL,
	PRIMARY KEY (item_id, customer_group)
);
CREATE INDEX IF NOT EXISTS idx_knowledge_cg_group ON knowledge_customer_group(customer_group);
