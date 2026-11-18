/**
 * Which languages a sheet's texts (short description, bullets, long
 * description) must be complete in: the languages of the webshop markets it is
 * published in. A sheet not published anywhere yet is checked in its primary
 * language instead.
 *
 * Used by the Sheets "Todo" view and the advanced filter's Missing chips.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

import { sanitizeMarkets } from '$lib/server/webshopMarkets.js';

/** Webshop market → text language. Poland uses the English texts (no Polish translations). */
export const MARKET_LANG = { DK: 'da', SE: 'sv', NO: 'no', INT: 'en', PL: 'en' };
export const TEXT_LANGS = ['da', 'sv', 'no', 'en'];

/**
 * Per-language text columns: short_<l>, long_<l>, usp_<l> (filled bullets).
 * Aggregates over a `LEFT JOIN translations tx ON tx.sheet_id = s.id AND <TEXT_JOIN_SQL>`
 * with `GROUP BY s.id` — one pass instead of a subquery per column.
 */
export const TEXT_JOIN_SQL = `trim(COALESCE(tx.value, '')) != '' AND tx.language IN (${TEXT_LANGS.map((l) => `'${l}'`).join(', ')})
	AND (tx.key IN ('product_description', 'long_description') OR tx.key LIKE 'usp\\_%' ESCAPE '\\')`;
export const TEXT_COLUMNS_SQL = TEXT_LANGS.map((l) => `
	MAX(CASE WHEN tx.language = '${l}' AND tx.key = 'product_description' THEN 1 ELSE 0 END) AS short_${l},
	MAX(CASE WHEN tx.language = '${l}' AND tx.key = 'long_description' THEN 1 ELSE 0 END) AS long_${l},
	SUM(CASE WHEN tx.language = '${l}' AND tx.key LIKE 'usp\\_%' ESCAPE '\\' THEN 1 ELSE 0 END) AS usp_${l}`).join(',');

/**
 * Loads publisher mapping + webshop publish state once.
 * Returns sku → { pfxPub, mappedPub, markets } (effective published markets:
 * explicit selection limited by the publisher licence unless "override
 * licence", else everything the licence allows).
 * @param {D1} salesDb
 */
export async function loadMarketResolver(salesDb) {
	const [pfx, ovr, web, lic] = await Promise.all([
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		salesDb.prepare('SELECT lower(sku) AS sku, publisher FROM product_publisher_override').all(),
		salesDb.prepare('SELECT lower(sku) AS sku, published_markets, override_license FROM product_webshop').all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT publisher, market FROM publisher_market').all().catch(() => ({ results: [] })),
	]);
	const prefixMap = new Map((pfx.results ?? []).map((r) => [String(r.prefix).toUpperCase(), r.publisher]));
	const overrideMap = new Map((ovr.results ?? []).map((r) => [r.sku, r.publisher]));
	const webOf = new Map((web.results ?? []).map((r) => [r.sku, r]));
	const licOf = new Map();
	for (const r of lic.results ?? []) (licOf.get(r.publisher) ?? licOf.set(r.publisher, []).get(r.publisher)).push(r.market);

	/** @param {string} sku */
	return (sku) => {
		const s = String(sku ?? '').trim();
		const key = s.toLowerCase();
		const prefix = (s.match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
		const pfxPub = prefixMap.get(prefix) ?? prefix ?? null;
		const mappedPub = overrideMap.get(key) ?? pfxPub;
		const w = webOf.get(key);
		const licence = sanitizeMarkets(licOf.get(mappedPub) ?? []);
		let explicit = null;
		if (w?.published_markets != null) { try { explicit = sanitizeMarkets(JSON.parse(w.published_markets)); } catch { explicit = []; } }
		const markets = explicit == null ? licence : w?.override_license ? explicit : explicit.filter((m) => licence.includes(m));
		return { pfxPub, mappedPub, markets };
	};
}

/** @param {string[]} markets @param {string | null | undefined} primary */
export function requiredLangs(markets, primary) {
	const langs = [...new Set(markets.map((m) => MARKET_LANG[m]).filter(Boolean))];
	return langs.length ? langs : [TEXT_LANGS.includes(primary ?? '') ? primary : 'da'];
}

/**
 * Which texts are incomplete in any of `langs` → subset of ['short', 'bullets', 'long'].
 * @param {any} row with short_<l>/long_<l>/usp_<l> columns and usp_count
 * @param {string[]} langs
 */
export function missingTexts(row, langs) {
	const need = row.usp_count ?? 3;
	const out = [];
	if (langs.some((l) => !row[`short_${l}`])) out.push('short');
	if (need < 1 || langs.some((l) => (row[`usp_${l}`] ?? 0) < need)) out.push('bullets');
	if (langs.some((l) => !row[`long_${l}`])) out.push('long');
	return out;
}
