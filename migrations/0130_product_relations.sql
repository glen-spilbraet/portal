-- 0130_product_relations.sql — product relations: "<sku> is <type> for <target_sku>"
-- e.g. Catan 5-6 (DA) is an Expansion for Catan (DA). One product can be linked
-- to many targets (multilingual expansions, tokens that fit DA + EN, …).
--
-- App DB (DB binding) — per environment, so dev can be used to test and demo
-- without touching live data. Apply to BOTH, prod BEFORE the code is merged
-- (the shop feed reads these tables):
--   wrangler d1 execute portal-db-dev --remote --file=migrations/0130_product_relations.sql
--   wrangler d1 execute portal-db     --remote --file=migrations/0130_product_relations.sql
--
--   relation_type        Expansion / Accessory / Display (editable in Admin → Relations)
--   relation_type_label  per language: name ("Udvidelse"), forward ("Udvidelse til",
--                        shown on the expansion) and inverse ("Udvidelser", shown on
--                        the base game)
--   product_relation     the links, keyed by SKU (case-insensitive)

CREATE TABLE IF NOT EXISTS relation_type (
	id         TEXT PRIMARY KEY,
	position   INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relation_type_label (
	type_id  TEXT NOT NULL REFERENCES relation_type(id) ON DELETE CASCADE,
	language TEXT NOT NULL,
	name     TEXT NOT NULL,
	forward  TEXT,
	inverse  TEXT,
	PRIMARY KEY (type_id, language)
);

CREATE TABLE IF NOT EXISTS product_relation (
	sku        TEXT NOT NULL COLLATE NOCASE,
	type_id    TEXT NOT NULL REFERENCES relation_type(id) ON DELETE CASCADE,
	target_sku TEXT NOT NULL COLLATE NOCASE,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	created_by TEXT,
	PRIMARY KEY (sku, type_id, target_sku)
);
CREATE INDEX IF NOT EXISTS idx_product_relation_target ON product_relation(target_sku, type_id);

INSERT OR IGNORE INTO relation_type (id, position) VALUES ('expansion', 1), ('accessory', 2), ('display', 3);

INSERT OR IGNORE INTO relation_type_label (type_id, language, name, forward, inverse) VALUES
	('expansion', 'da', 'Udvidelse',     'Udvidelse til',            'Udvidelser'),
	('expansion', 'sv', 'Expansion',     'Expansion till',           'Expansioner'),
	('expansion', 'no', 'Utvidelse',     'Utvidelse til',            'Utvidelser'),
	('expansion', 'en', 'Expansion',     'Expansion for',            'Expansions'),
	('expansion', 'pl', 'Dodatek',       'Dodatek do',               'Dodatki'),
	('expansion', 'fi', 'Lisäosa',       'Lisäosa peliin',           'Lisäosat'),
	('accessory', 'da', 'Tilbehør',      'Tilbehør til',             'Tilbehør'),
	('accessory', 'sv', 'Tillbehör',     'Tillbehör till',           'Tillbehör'),
	('accessory', 'no', 'Tilbehør',      'Tilbehør til',             'Tilbehør'),
	('accessory', 'en', 'Accessory',     'Accessory for',            'Accessories'),
	('accessory', 'pl', 'Akcesorium',    'Akcesorium do',            'Akcesoria'),
	('accessory', 'fi', 'Lisätarvike',   'Lisätarvike tuotteelle',   'Lisätarvikkeet'),
	('display',   'da', 'Display',       'Display til',              'Displays'),
	('display',   'sv', 'Display',       'Display för',              'Displayer'),
	('display',   'no', 'Display',       'Display for',              'Displayer'),
	('display',   'en', 'Display',       'Display for',              'Displays'),
	('display',   'pl', 'Ekspozytor',    'Ekspozytor do',            'Ekspozytory'),
	('display',   'fi', 'Esittelyteline','Esittelyteline tuotteelle','Esittelytelineet');
