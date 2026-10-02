/**
 * Publisher registry + per-SKU mapping (the "secondary / mapped publisher").
 * All on SALES_DB (shared prod portal-db) so dev + prod are identical.
 *
 *   publisher                 — canonical names (incl. ones with no SKU prefix).
 *   publisher_prefix          — the SKU-prefix model (IEL → Iello, …).
 *   product_publisher_override — per-SKU manual mapping (the secondary layer).
 *
 * deal_line_items.publisher stores the resolved value (override → prefix → code);
 * mapping a SKU re-resolves just that SKU so the "Mapped" report view is instant.
 */

// Re-resolve the stored publisher for ONE sku after its mapping changes.
const REAPPLY_ONE = `UPDATE deal_line_items SET publisher = COALESCE(
	(SELECT publisher FROM product_publisher_override o WHERE o.sku = deal_line_items.sku),
	(SELECT publisher FROM publisher_prefix p WHERE p.prefix = deal_line_items.sku_prefix),
	sku_prefix) WHERE sku = ?`;

export async function listPublishers(db) {
	const rows = await db.prepare(
		`SELECT p.name,
		        (SELECT COUNT(*) FROM product_publisher_override o WHERE o.publisher = p.name) AS mapped_count,
		        (SELECT COUNT(*) FROM publisher_prefix pp WHERE pp.publisher = p.name) AS prefix_count
		 FROM publisher p ORDER BY p.name COLLATE NOCASE`
	).all();
	return rows.results ?? [];
}

export async function createPublisher(db, name) {
	const clean = (name ?? '').trim();
	if (!clean) return;
	await db.prepare('INSERT OR IGNORE INTO publisher (id, name) VALUES (?, ?)')
		.bind(crypto.randomUUID(), clean).run();
}

export async function deletePublisher(db, name) {
	await db.prepare('DELETE FROM publisher WHERE name = ?').bind(name).run();
}

// Canonical product name for a SKU, from the sheets catalog (sales_sheets +
// translations) — the source of truth, independent of rep-edited line text.
// Prefers the sheet's primary language, else any filled product_name. NULL if
// the SKU has no sheet (caller falls back to the line-item text).
const catalogName = (skuExpr) => `(
	SELECT tr.value FROM sales_sheets s2 JOIN translations tr ON tr.sheet_id = s2.id
	WHERE lower(s2.sku) = lower(${skuExpr}) AND tr.key = 'product_name' AND COALESCE(tr.value, '') != ''
	ORDER BY (tr.language = s2.primary_language) DESC LIMIT 1)`;

/** Mappings (overridden SKUs) currently pointing at this publisher. */
export async function getPublisherMappings(db, name) {
	const rows = await db.prepare(
		`SELECT o.sku,
		        COALESCE(${catalogName('o.sku')}, (SELECT MAX(li.name) FROM deal_line_items li WHERE li.sku = o.sku)) AS name
		 FROM product_publisher_override o WHERE o.publisher = ? ORDER BY o.sku`
	).bind(name).all();
	return rows.results ?? [];
}

/**
 * Distinct SKUs seen in sales, matching a query on SKU, line text, OR the
 * catalog product name. The displayed name is the catalog name (falling back to
 * the line text), so rep-edited titles don't show. Returns the current override
 * (if any) so the UI can warn about swaps.
 */
export async function searchLineItemSkus(db, q) {
	const term = `%${(q ?? '').trim()}%`;
	const rows = await db.prepare(
		`SELECT li.sku,
		        COALESCE(${catalogName('li.sku')}, MAX(li.name)) AS name,
		        (${catalogName('li.sku')} IS NOT NULL) AS from_catalog,
		        MAX(li.sku_prefix) AS prefix,
		        (SELECT publisher FROM product_publisher_override o WHERE o.sku = li.sku) AS override_pub,
		        ROUND(SUM(li.amount_dkk)) AS dkk
		 FROM deal_line_items li
		 WHERE li.sku IS NOT NULL AND li.sku != '' AND (
		     li.sku LIKE ? OR li.name LIKE ?
		     OR lower(li.sku) IN (
		         SELECT lower(s3.sku) FROM sales_sheets s3 JOIN translations tr3 ON tr3.sheet_id = s3.id
		         WHERE tr3.key = 'product_name' AND tr3.value LIKE ?
		     )
		 )
		 GROUP BY li.sku ORDER BY (override_pub IS NULL) DESC, dkk DESC LIMIT 40`
	).bind(term, term, term).all();
	return rows.results ?? [];
}

/** Map a SKU to a publisher (secondary override) and re-resolve that SKU. */
export async function mapSku(db, sku, publisher) {
	const s = (sku ?? '').trim();
	const p = (publisher ?? '').trim();
	if (!s || !p) return;
	await db.batch([
		db.prepare('INSERT OR REPLACE INTO product_publisher_override (sku, publisher) VALUES (?, ?)').bind(s, p),
		db.prepare(REAPPLY_ONE).bind(s),
	]);
}

/** Remove a SKU's manual mapping (falls back to the prefix model) and re-resolve. */
export async function unmapSku(db, sku) {
	const s = (sku ?? '').trim();
	if (!s) return;
	await db.batch([
		db.prepare('DELETE FROM product_publisher_override WHERE sku = ?').bind(s),
		db.prepare(REAPPLY_ONE).bind(s),
	]);
}
