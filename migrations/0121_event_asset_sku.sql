-- 0121_event_asset_sku.sql — Product tags on event photos/video.
-- Which products (SKUs) appear on a given event asset. Many per asset, no
-- position — just "these products are on this photo". Tagging a SKU that isn't
-- yet linked to the event also adds it to event_sku (done in app code).
-- Apply to BOTH portal-db-dev and portal-db (DB binding, per environment).

CREATE TABLE IF NOT EXISTS event_asset_sku (
	asset_id    TEXT NOT NULL,
	sku         TEXT NOT NULL,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (asset_id, sku)
);
CREATE INDEX IF NOT EXISTS idx_event_asset_sku_sku ON event_asset_sku(sku);
