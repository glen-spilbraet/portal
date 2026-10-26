-- One-time data backfill (idempotent, safe to re-run).
-- The sync's INSERT OR REPLACE rewrote deal_line_items without series_id, so any
-- line re-synced since its SKU was mapped lost its series_id — series reports
-- undercounted those rows while the publisher view still counted them. The sync
-- worker now resolves series_id on every upsert; this fixes the already-drifted
-- rows. Re-applies the mapped series to every line whose SKU is mapped, guarded
-- by the publisher match (non-matching publisher → series_id NULL, as intended).
UPDATE deal_line_items SET series_id = (
	SELECT ps.series_id FROM product_series ps
	JOIN series s ON s.id = ps.series_id
	WHERE ps.sku = deal_line_items.sku AND s.publisher = deal_line_items.publisher
)
WHERE sku IN (SELECT sku FROM product_series);
