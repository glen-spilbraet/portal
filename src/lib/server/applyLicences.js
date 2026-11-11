/**
 * "Apply licences to unpublished products": products whose webshop Publication
 * is an explicit EMPTY list (mostly left by Product Import before blank CSV
 * markets meant "follow the licence") are reset to follow their publisher's
 * licence (published_markets = NULL) — but only when that publisher now has
 * at least one licensed market. Hand-made selections and "override licence"
 * products are never touched.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

import { sanitizeMarkets, MARKETS } from '$lib/server/webshopMarkets.js';

const EMPTY = `published_markets IS NOT NULL AND replace(published_markets, ' ', '') = '[]' AND COALESCE(override_license, 0) = 0`;

/** Preview grouped by publisher. @param {D1} db app DB  @param {D1} salesDb */
export async function previewApplyLicences(db, salesDb) {
	const [rows, pfx, ovr, lic] = await Promise.all([
		salesDb.prepare(`SELECT sku FROM product_webshop WHERE ${EMPTY}`).all(),
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		salesDb.prepare('SELECT lower(sku) AS sku, publisher FROM product_publisher_override').all(),
		salesDb.prepare('SELECT publisher, market FROM publisher_market').all().catch(() => ({ results: [] })),
	]);
	const prefixMap = new Map((pfx.results ?? []).map((r) => [String(r.prefix).toUpperCase(), r.publisher]));
	const overrideMap = new Map((ovr.results ?? []).map((r) => [r.sku, r.publisher]));
	const licOf = new Map();
	for (const r of lic.results ?? []) (licOf.get(r.publisher) ?? licOf.set(r.publisher, []).get(r.publisher)).push(r.market);
	const publisherOf = (sku) => {
		const o = overrideMap.get(sku.toLowerCase());
		if (o) return o;
		const p = (sku.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
		return p ? (prefixMap.get(p) ?? p) : null;
	};

	const candidates = [];
	let unlicensed = 0;
	for (const r of rows.results ?? []) {
		const sku = String(r.sku ?? '').trim();
		if (!sku) continue;
		const publisher = publisherOf(sku);
		const licence = sanitizeMarkets(licOf.get(publisher) ?? []);
		if (!publisher || !licence.length) { unlicensed++; continue; }
		candidates.push({ sku, publisher, licence: MARKETS.filter((m) => licence.includes(m)) });
	}

	// Names + sheet ids for display (app DB).
	const names = new Map();
	if (candidates.length) {
		const res = await db.prepare(
			`SELECT s.id, lower(s.sku) AS sku,
			        COALESCE(MAX(CASE WHEN t.language = s.primary_language THEN t.value END), MAX(CASE WHEN t.language = 'en' THEN t.value END), MAX(t.value)) AS name
			 FROM sales_sheets s
			 LEFT JOIN translations t ON t.sheet_id = s.id AND t.key = 'product_name' AND trim(COALESCE(t.value, '')) != ''
			 WHERE trim(COALESCE(s.sku, '')) != ''
			 GROUP BY s.id`
		).all();
		for (const r of res.results ?? []) names.set(r.sku, { id: r.id, name: r.name });
	}

	const groups = new Map();
	for (const c of candidates) {
		const n = names.get(c.sku.toLowerCase());
		const g = groups.get(c.publisher) ?? groups.set(c.publisher, { publisher: c.publisher, licence: c.licence, products: [] }).get(c.publisher);
		g.products.push({ sku: c.sku, name: n?.name ?? null, sheetId: n?.id ?? null });
	}
	const out = [...groups.values()]
		.map((g) => ({ ...g, products: g.products.sort((a, b) => a.sku.localeCompare(b.sku)) }))
		.sort((a, b) => b.products.length - a.products.length || a.publisher.localeCompare(b.publisher));
	return { groups: out, total: candidates.length, unlicensed };
}

/** Reset the given SKUs to follow their publisher licence (re-checks the "empty" rule). @param {D1} salesDb */
export async function applyLicences(salesDb, skus, by) {
	const list = [...new Set((skus ?? []).map((s) => String(s ?? '').trim()).filter(Boolean))];
	const now = new Date().toISOString();
	let updated = 0;
	for (let i = 0; i < list.length; i += 50) {
		const res = await salesDb.batch(list.slice(i, i + 50).map((sku) =>
			salesDb.prepare(`UPDATE product_webshop SET published_markets = NULL, updated_by = ?, updated_at = ? WHERE sku = ? AND ${EMPTY}`).bind(by ?? null, now, sku)
		));
		for (const r of res) updated += r.meta?.changes ?? 0;
	}
	return { updated };
}
