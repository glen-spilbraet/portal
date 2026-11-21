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

import { MARKETS, sanitizeMarkets } from '$lib/languages.js';

// Market codes live in $lib/languages.js (shared with the browser).
export { MARKETS, sanitizeMarkets };

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
	try {
		const rows = await db.prepare('SELECT market FROM publisher_market WHERE publisher = ?').bind(publisher).all();
		return sanitizeMarkets((/** @type {any[]} */ (rows.results ?? [])).map((r) => r.market));
	} catch { return []; } // table may not exist yet (migration 0080)
}

/** All publishers' licensed markets as { publisher: string[] }. @param {D1} db */
export async function listPublisherMarkets(db) {
	/** @type {Record<string, string[]>} */
	const out = {};
	try {
		const rows = await db.prepare('SELECT publisher, market FROM publisher_market').all();
		for (const r of /** @type {any[]} */ (rows.results ?? [])) (out[r.publisher] ??= []).push(r.market);
		for (const k of Object.keys(out)) out[k] = sanitizeMarkets(out[k]);
	} catch { /* table may not exist yet (migration 0080) */ }
	return out;
}

/**
 * Record a change to publish rights (migration 0127). Never fails the save: if
 * the table is not there yet, the change simply is not logged.
 * @param {D1} db
 * @param {{ kind: 'publisher' | 'product', ref: string, before: unknown, after: unknown, source?: string, by?: string | null }} e
 */
export async function logRightsChange(db, { kind, ref, before, after, source, by }) {
	const b = JSON.stringify(before ?? null), a = JSON.stringify(after ?? null);
	if (b === a) return;
	try {
		await db.prepare('INSERT INTO webshop_rights_log (kind, ref, before, after, source, changed_by, changed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(kind, ref, b, a, source ?? null, by ?? null, new Date().toISOString()).run();
	} catch { /* table not created yet */ }
}

/** Recent changes for one publisher or product, newest first. @param {D1} db */
export async function listRightsChanges(db, kind, ref, limit = 20) {
	try {
		const rows = await db.prepare(
			`SELECT before, after, source, changed_by, changed_at FROM webshop_rights_log
			 WHERE kind = ? AND lower(ref) = lower(?) ORDER BY changed_at DESC, id DESC LIMIT ?`
		).bind(kind, ref, limit).all();
		const parse = (/** @type {any} */ v) => { try { return JSON.parse(v); } catch { return null; } };
		return (/** @type {any[]} */ (rows.results ?? [])).map((r) => ({ ...r, before: parse(r.before), after: parse(r.after) }));
	} catch { return []; }
}

/**
 * Replace a publisher's licensed markets.
 * @param {D1} db @param {string} publisher @param {unknown} markets @param {string | null} [by]
 */
export async function setPublisherMarkets(db, publisher, markets, by) {
	const p = (publisher ?? '').trim();
	if (!p) return [];
	const ms = sanitizeMarkets(markets);
	const before = await getPublisherMarkets(db, p);
	await db.batch([
		db.prepare('DELETE FROM publisher_market WHERE publisher = ?').bind(p),
		...ms.map((m) => db.prepare('INSERT OR IGNORE INTO publisher_market (publisher, market) VALUES (?, ?)').bind(p, m)),
	]);
	await logRightsChange(db, { kind: 'publisher', ref: p, before, after: ms, source: 'publishers', by });
	return ms;
}

/**
 * Switch ONE market on or off for a publisher. Unlike a full replace, two
 * quick clicks (or two admins) can never undo each other.
 * @param {D1} db @param {string} publisher @param {string} market @param {boolean} on @param {string | null} [by]
 * @returns {Promise<string[] | null>} the publisher's markets afterwards, or null for an unknown market
 */
export async function togglePublisherMarket(db, publisher, market, on, by) {
	const p = (publisher ?? '').trim();
	const [m] = sanitizeMarkets([market]);
	if (!p || !m) return null;
	const before = await getPublisherMarkets(db, p);
	if (on) await db.prepare('INSERT OR IGNORE INTO publisher_market (publisher, market) VALUES (?, ?)').bind(p, m).run();
	else await db.prepare('DELETE FROM publisher_market WHERE publisher = ? AND market = ?').bind(p, m).run();
	const after = await getPublisherMarkets(db, p);
	await logRightsChange(db, { kind: 'publisher', ref: p, before, after, source: 'publishers', by });
	return after;
}

/** A product's webshop publish state. @param {D1} db @returns {Promise<{publishedMarkets: string[] | null, overrideLicense: boolean, updatedBy?: string | null, updatedAt?: string | null}>} */
export async function getProductWebshop(db, sku) {
	const s = (sku ?? '').trim();
	if (!s) return { publishedMarkets: null, overrideLicense: false };
	let row;
	try {
		// ORDER BY: SKUs are matched case-insensitively; if an older import left
		// two spellings, the most recently changed row is the one that counts.
		row = /** @type {any} */ (await db.prepare('SELECT published_markets, override_license, updated_by, updated_at FROM product_webshop WHERE lower(sku) = lower(?) ORDER BY updated_at DESC LIMIT 1').bind(s).first());
	} catch { return { publishedMarkets: null, overrideLicense: false }; } // table may not exist yet
	if (!row) return { publishedMarkets: null, overrideLicense: false };
	/** @type {string[] | null} */
	let published = null;
	if (row.published_markets != null) {
		try { const v = JSON.parse(row.published_markets); published = Array.isArray(v) ? sanitizeMarkets(v) : null; } catch { published = []; }
	}
	return { publishedMarkets: published, overrideLicense: !!row.override_license, updatedBy: row.updated_by ?? null, updatedAt: row.updated_at ?? null };
}

/**
 * Set a product's webshop publish state.
 *   publishedMarkets: null  → follow the publisher licence (and future changes to it)
 *   publishedMarkets: [...] → exactly these markets (an empty list = nowhere)
 * "Override licence" only means something together with an explicit list, so
 * following the licence always clears it.
 * @param {D1} db @param {string} sku
 * @param {{ publishedMarkets: unknown, overrideLicense?: boolean }} state
 * @param {string | null} [by] @param {string} [source]
 * @returns {Promise<{ publishedMarkets: string[] | null, overrideLicense: boolean } | undefined>}
 */
export async function setProductWebshop(db, sku, { publishedMarkets, overrideLicense }, by, source = 'sheet') {
	const s = (sku ?? '').trim();
	if (!s) return;
	const ms = publishedMarkets == null ? null : sanitizeMarkets(publishedMarkets);
	const override = ms == null ? false : !!overrideLicense;
	const prev = await getProductWebshop(db, s);
	const now = new Date().toISOString();
	const json = ms == null ? null : JSON.stringify(ms);
	// Update whatever spelling of the SKU is already stored; insert only if none is.
	const res = await db.prepare(
		'UPDATE product_webshop SET published_markets = ?, override_license = ?, updated_by = ?, updated_at = ? WHERE lower(sku) = lower(?)'
	).bind(json, override ? 1 : 0, by ?? null, now, s).run();
	if (!res.meta?.changes) {
		await db.prepare(
			`INSERT INTO product_webshop (sku, published_markets, override_license, updated_by, updated_at)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT(sku) DO UPDATE SET
			   published_markets = excluded.published_markets,
			   override_license  = excluded.override_license,
			   updated_by        = excluded.updated_by,
			   updated_at        = excluded.updated_at`
		).bind(s, json, override ? 1 : 0, by ?? null, now).run();
	}
	await logRightsChange(db, {
		kind: 'product', ref: s, source, by,
		before: { markets: prev.publishedMarkets, override: prev.overrideLicense },
		after: { markets: ms, override },
	});
	return { publishedMarkets: ms, overrideLicense: override };
}

/**
 * THE rule for where a product is published (used by the editor, the Sheets
 * filter / Todo and anything else that needs it — keep it in one place):
 *   no explicit selection (null)   → every market the publisher licence allows
 *   explicit + "override licence"  → exactly the selection
 *   explicit                       → the selection, limited to the licence
 * @param {unknown} allowed the publisher's licensed markets
 * @param {{ publishedMarkets: string[] | null | undefined, overrideLicense?: boolean }} state
 * @returns {string[]}
 */
export function effectivePublishedMarkets(allowed, { publishedMarkets, overrideLicense }) {
	const licence = sanitizeMarkets(allowed);
	if (publishedMarkets == null) return licence;
	const explicit = sanitizeMarkets(publishedMarkets);
	return overrideLicense ? explicit : explicit.filter((m) => licence.includes(m));
}
