/**
 * Webshop market licensing (publisher level) + per-product publish state.
 * All on SALES_DB (shared prod portal-db), like the publisher registry and the
 * category taxonomy.
 *
 *   publisher_market  — markets a publisher is licensed to sell in. No rows =
 *                       no markets allowed (strict allow-list).
 *   product_webshop   — a product's published markets + "override licence" flag.
 *
 * Default publish state: a product with no explicit selection is published in
 * ALL markets its publisher licence allows.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

export const MARKETS = ['DK', 'SE', 'NO', 'INT', 'PL'];
const MARKET_SET = new Set(MARKETS);
export const sanitizeMarkets = (arr) => [...new Set((arr ?? []).map((m) => String(m).toUpperCase()).filter((m) => MARKET_SET.has(m)))];

/** Resolve a SKU's publisher like the sales sync / shop feed: override → prefix (leading letters) → the prefix itself. @param {D1} db */
export async function resolvePublisherForSku(db, sku) {
	const s = (sku ?? '').trim();
	if (!s) return null;
	const ov = /** @type {any} */ (await db.prepare('SELECT publisher FROM product_publisher_override WHERE lower(sku) = lower(?)').bind(s).first());
	if (ov?.publisher) return ov.publisher;
	const prefix = (s.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
	if (!prefix) return null;
	const pp = /** @type {any} */ (await db.prepare('SELECT publisher FROM publisher_prefix WHERE prefix = ?').bind(prefix).first());
	return pp?.publisher ?? prefix;
}

/** Markets a publisher is licensed for. @param {D1} db @returns {Promise<string[]>} */
export async function getPublisherMarkets(db, publisher) {
	if (!publisher) return [];
	const rows = await db.prepare('SELECT market FROM publisher_market WHERE publisher = ?').bind(publisher).all();
	return sanitizeMarkets((/** @type {any[]} */ (rows.results ?? [])).map((r) => r.market));
}

/** All publishers' licensed markets as { publisher: string[] }. @param {D1} db */
export async function listPublisherMarkets(db) {
	const rows = await db.prepare('SELECT publisher, market FROM publisher_market').all();
	/** @type {Record<string, string[]>} */
	const out = {};
	for (const r of /** @type {any[]} */ (rows.results ?? [])) (out[r.publisher] ??= []).push(r.market);
	for (const k of Object.keys(out)) out[k] = sanitizeMarkets(out[k]);
	return out;
}

/** Replace a publisher's licensed markets. @param {D1} db */
export async function setPublisherMarkets(db, publisher, markets) {
	const p = (publisher ?? '').trim();
	if (!p) return [];
	const ms = sanitizeMarkets(markets);
	await db.batch([
		db.prepare('DELETE FROM publisher_market WHERE publisher = ?').bind(p),
		...ms.map((m) => db.prepare('INSERT OR IGNORE INTO publisher_market (publisher, market) VALUES (?, ?)').bind(p, m)),
	]);
	return ms;
}

/** A product's webshop publish state. @param {D1} db @returns {Promise<{publishedMarkets: string[] | null, overrideLicense: boolean}>} */
export async function getProductWebshop(db, sku) {
	const s = (sku ?? '').trim();
	if (!s) return { publishedMarkets: null, overrideLicense: false };
	const row = /** @type {any} */ (await db.prepare('SELECT published_markets, override_license FROM product_webshop WHERE lower(sku) = lower(?)').bind(s).first());
	if (!row) return { publishedMarkets: null, overrideLicense: false };
	/** @type {string[] | null} */
	let published = null;
	if (row.published_markets != null) {
		try { published = sanitizeMarkets(JSON.parse(row.published_markets)); } catch { published = []; }
	}
	return { publishedMarkets: published, overrideLicense: !!row.override_license };
}

/** Set a product's webshop publish state. @param {D1} db */
export async function setProductWebshop(db, sku, { publishedMarkets, overrideLicense }, by) {
	const s = (sku ?? '').trim();
	if (!s) return;
	const ms = sanitizeMarkets(publishedMarkets);
	await db.prepare(
		`INSERT INTO product_webshop (sku, published_markets, override_license, updated_by, updated_at)
		 VALUES (?, ?, ?, ?, ?)
		 ON CONFLICT(sku) DO UPDATE SET
		   published_markets = excluded.published_markets,
		   override_license  = excluded.override_license,
		   updated_by        = excluded.updated_by,
		   updated_at        = excluded.updated_at`
	).bind(s, JSON.stringify(ms), overrideLicense ? 1 : 0, by ?? null, new Date().toISOString()).run();
	return ms;
}

/**
 * Effective markets a product is actually published to, for the webshop:
 *   override → the explicit selection (any of the 5 markets)
 *   else, no explicit selection → all allowed markets (the default)
 *   else → explicit selection ∩ allowed
 */
export function effectivePublishedMarkets(allowed, { publishedMarkets, overrideLicense }) {
	const allowedSet = new Set(sanitizeMarkets(allowed));
	if (overrideLicense) return sanitizeMarkets(publishedMarkets);
	if (publishedMarkets == null) return [...allowedSet];
	return sanitizeMarkets(publishedMarkets).filter((m) => allowedSet.has(m));
}
