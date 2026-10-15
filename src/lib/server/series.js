/**
 * Series registry + per-SKU series mapping — one level below the mapped publisher.
 * All on SALES_DB (shared prod portal-db). A product's series is valid only while
 * the series' publisher matches the product's MAPPED publisher
 * (deal_line_items.publisher); the resolve query enforces that, so changing a
 * product's publisher auto-clears a now-invalid series.
 *
 * deal_line_items.series_id stores the resolved series; re-resolved per SKU on a
 * series mapping change here, and on a publisher mapping change (publishers.js).
 */

const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

// Re-resolve the stored series_id for ONE sku, guarded by the publisher match.
export const REAPPLY_SERIES_ONE = `UPDATE deal_line_items SET series_id = (
	SELECT ps.series_id FROM product_series ps JOIN series s ON s.id = ps.series_id
	WHERE ps.sku = deal_line_items.sku AND s.publisher = deal_line_items.publisher
) WHERE sku = ?`;

// Canonical product name for a SKU (sheets catalog), matching publishers.js.
const catalogName = (skuExpr) => `(
	SELECT tr.value FROM sales_sheets s2 JOIN translations tr ON tr.sheet_id = s2.id
	WHERE lower(s2.sku) = lower(${skuExpr}) AND tr.key = 'product_name' AND COALESCE(tr.value, '') != ''
	ORDER BY (tr.language = s2.primary_language) DESC LIMIT 1)`;

/** Series under a publisher, with how many SKUs are mapped to each. */
export async function listSeries(db, publisher) {
	const rows = await db.prepare(
		`SELECT s.id, s.name,
		        (SELECT COUNT(*) FROM product_series ps WHERE ps.series_id = s.id) AS mapped_count
		 FROM series s WHERE s.publisher = ? ORDER BY s.name COLLATE NOCASE`
	).bind(publisher).all();
	return rows.results ?? [];
}

export async function getSeries(db, id) {
	return db.prepare('SELECT * FROM series WHERE id = ?').bind(id).first();
}

/** All series across every publisher (for the report-builder picker). */
export async function listAllSeries(db) {
	const rows = await db.prepare(
		'SELECT id, publisher, name FROM series ORDER BY publisher COLLATE NOCASE, name COLLATE NOCASE'
	).all();
	return rows.results ?? [];
}

/** Create a series under a publisher (idempotent on publisher+name); returns its id. */
export async function createSeries(db, publisher, name) {
	const p = (publisher ?? '').trim();
	const n = (name ?? '').trim();
	if (!p || !n) return null;
	const id = crypto.randomUUID();
	await db.prepare('INSERT OR IGNORE INTO series (id, publisher, name) VALUES (?,?,?)').bind(id, p, n).run();
	const row = await db.prepare('SELECT id FROM series WHERE publisher = ? AND name = ?').bind(p, n).first();
	return row?.id ?? id;
}

export async function renameSeries(db, id, name) {
	const n = (name ?? '').trim();
	if (!n) return;
	await db.prepare('UPDATE series SET name = ? WHERE id = ?').bind(n, id).run();
}

/** Delete a series: unmap its SKUs + re-resolve them (clears series_id), then drop it. */
export async function deleteSeries(db, id) {
	const skus = (await db.prepare('SELECT sku FROM product_series WHERE series_id = ?').bind(id).all()).results ?? [];
	await db.prepare('DELETE FROM product_series WHERE series_id = ?').bind(id).run();
	for (const b of chunk(skus, 40)) await db.batch(b.map((r) => db.prepare(REAPPLY_SERIES_ONE).bind(r.sku)));
	await db.prepare('DELETE FROM series WHERE id = ?').bind(id).run();
}

/** Map a SKU into a series (one per SKU) and re-resolve its series_id. */
export async function mapSkuToSeries(db, sku, seriesId) {
	const s = (sku ?? '').trim();
	if (!s || !seriesId) return;
	await db.batch([
		db.prepare('INSERT OR REPLACE INTO product_series (sku, series_id) VALUES (?, ?)').bind(s, seriesId),
		db.prepare(REAPPLY_SERIES_ONE).bind(s),
	]);
}

/** Remove a SKU's series mapping and re-resolve (clears series_id). */
export async function unmapSkuSeries(db, sku) {
	const s = (sku ?? '').trim();
	if (!s) return;
	await db.batch([
		db.prepare('DELETE FROM product_series WHERE sku = ?').bind(s),
		db.prepare(REAPPLY_SERIES_ONE).bind(s),
	]);
}

/**
 * Candidate products for mapping into a series: SKUs whose MAPPED publisher is
 * this publisher (so only that publisher's products can be mapped), matching a
 * query on SKU / line text / catalog name. Shows the SKU's current series.
 */
export async function searchPublisherProducts(db, publisher, q) {
	const term = `%${(q ?? '').trim()}%`;
	const rows = await db.prepare(
		`SELECT li.sku,
		        COALESCE(${catalogName('li.sku')}, MAX(li.name)) AS name,
		        MAX(li.series_id) AS series_id,
		        (SELECT name FROM series WHERE id = MAX(li.series_id)) AS series_name,
		        ROUND(SUM(li.amount_dkk)) AS dkk
		 FROM deal_line_items li
		 WHERE li.deal_kind = 'closed' AND li.publisher = ? AND li.sku IS NOT NULL AND li.sku != ''
		   AND (li.sku LIKE ? OR li.name LIKE ? OR lower(li.sku) IN (
		        SELECT lower(s3.sku) FROM sales_sheets s3 JOIN translations tr3 ON tr3.sheet_id = s3.id
		        WHERE tr3.key = 'product_name' AND tr3.value LIKE ?))
		 GROUP BY li.sku ORDER BY dkk DESC LIMIT 40`
	).bind(publisher, term, term, term).all();
	return rows.results ?? [];
}
