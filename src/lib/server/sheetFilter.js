/**
 * Advanced Sheets filter (edit access): publisher (SKU or mapped), name/SKU
 * text, missing info, webshop markets, preorder/restock dates, featured.
 *
 * One aggregate read of the sheets (app DB: data fields, texts in the primary
 * language, names) + small lookups on SALES_DB (publisher mapping, category
 * assignments, webshop publish state). Everything is then evaluated per sheet
 * in JS — D1 can't join across the two databases.
 *
 * Returns light rows for the cards incl. each sheet's `missing` list, so the
 * grid can show what's missing without another query per sheet.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

import { MARKETS, sanitizeMarkets } from '$lib/server/webshopMarkets.js';

export const MISSING_KEYS = ['age', 'time', 'players', 'pieces', 'category', 'short', 'bullets', 'long'];
const skuPrefix = (sku) => (String(sku ?? '').match(/^[A-Za-z]+/)?.[0] ?? '').toUpperCase();
const lc = (s) => String(s ?? '').trim().toLowerCase();

/** Parse + validate the query string. @param {URLSearchParams} p */
export function parseFilter(p) {
	const list = (k) => (p.get(k) ?? '').split(',').map((x) => x.trim()).filter(Boolean);
	const tri = (k) => (p.get(k) === 'yes' ? 'yes' : p.get(k) === 'no' ? 'no' : '');
	const markets = list('markets');
	return {
		pub: (p.get('pub') ?? '').trim(),
		pubMode: p.get('pubMode') === 'sku' ? 'sku' : 'mapped',
		q: (p.get('q') ?? '').split(/[\t\r\n]/).map((x) => x.trim()).find(Boolean)?.slice(0, 100) ?? '',
		missing: list('missing').filter((k) => MISSING_KEYS.includes(k)),
		missingMode: p.get('missingMode') === 'all' ? 'all' : 'any',
		marketsNone: markets.includes('none'),
		markets: sanitizeMarkets(markets.filter((m) => m !== 'none')),
		preorder: tri('preorder'),
		restock: tri('restock'),
		featured: p.get('featured') === '1',
	};
}

/** Publishers for the dropdown (registry + prefix map + overrides). @param {D1} salesDb */
export async function filterOptions(salesDb) {
	const names = new Set();
	const [reg, pfx, ovr] = await Promise.all([
		salesDb.prepare('SELECT name FROM publisher').all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT DISTINCT publisher AS name FROM publisher_prefix').all(),
		salesDb.prepare('SELECT DISTINCT publisher AS name FROM product_publisher_override').all(),
	]);
	for (const r of [...(reg.results ?? []), ...(pfx.results ?? []), ...(ovr.results ?? [])]) if (r.name) names.add(String(r.name));
	return { publishers: [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), markets: MARKETS };
}

/**
 * @param {D1} db app DB  @param {D1} salesDb
 * @param {ReturnType<typeof parseFilter>} f
 */
export async function filterSheets(db, salesDb, f) {
	// ── Sheets + texts (primary language) + names, one aggregate pass ───────
	const sheets = (await db.prepare(
		`SELECT s.id, s.sku, s.box_image_key, s.updated_at, s.featured_at, s.data_fields,
		        s.preorder_date, s.restock_date, COALESCE(s.usp_count, 3) AS usp_count,
		        MAX(CASE WHEN t.key = 'product_name' AND t.language = 'en' THEN t.value END) AS name_en,
		        MAX(CASE WHEN t.key = 'product_name' AND t.language = 'da' THEN t.value END) AS name_da,
		        MAX(CASE WHEN t.key = 'product_name' AND t.language = 'sv' THEN t.value END) AS name_sv,
		        MAX(CASE WHEN t.key = 'product_name' AND t.language = 'no' THEN t.value END) AS name_no,
		        MAX(CASE WHEN t.key = 'product_description' AND t.language = s.primary_language THEN 1 ELSE 0 END) AS has_short,
		        MAX(CASE WHEN t.key = 'long_description' AND t.language = s.primary_language THEN 1 ELSE 0 END) AS has_long,
		        SUM(CASE WHEN t.key LIKE 'usp\\_%' ESCAPE '\\' AND t.language = s.primary_language THEN 1 ELSE 0 END) AS usp_filled
		 FROM sales_sheets s
		 LEFT JOIN translations t ON t.sheet_id = s.id AND trim(COALESCE(t.value, '')) != ''
		   AND (t.key IN ('product_name', 'product_description', 'long_description') OR t.key LIKE 'usp\\_%' ESCAPE '\\')
		 WHERE trim(COALESCE(s.sku, '')) != ''
		 GROUP BY s.id`
	).all()).results ?? [];

	// ── SALES_DB lookups: mapping, category groups, webshop state ──────────
	const [pfx, ovr, groups, cats, web, lic] = await Promise.all([
		salesDb.prepare('SELECT prefix, publisher FROM publisher_prefix').all(),
		salesDb.prepare('SELECT lower(sku) AS sku, publisher FROM product_publisher_override').all(),
		salesDb.prepare(`SELECT g.id, lower(COALESCE((SELECT label FROM category_label WHERE object_type = 'group' AND object_id = g.id AND language = 'en'),
		                   (SELECT label FROM category_label WHERE object_type = 'group' AND object_id = g.id AND language = 'da'), '')) AS name
		                 FROM category_group g`).all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT lower(pc.sku) AS sku, c.group_id FROM product_category pc JOIN category c ON c.id = pc.category_id').all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT lower(sku) AS sku, published_markets, override_license FROM product_webshop').all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT publisher, market FROM publisher_market').all().catch(() => ({ results: [] })),
	]);
	const prefixMap = new Map((pfx.results ?? []).map((r) => [String(r.prefix).toUpperCase(), r.publisher]));
	const overrideMap = new Map((ovr.results ?? []).map((r) => [r.sku, r.publisher]));
	// "Category" = a selection in BOTH managed groups (Game Type and Type).
	const managed = (groups.results ?? []).filter((g) => g.name === 'game type' || g.name === 'type').map((g) => g.id);
	const groupsOf = new Map();
	for (const r of cats.results ?? []) (groupsOf.get(r.sku) ?? groupsOf.set(r.sku, new Set()).get(r.sku)).add(r.group_id);
	const webOf = new Map((web.results ?? []).map((r) => [r.sku, r]));
	const licOf = new Map();
	for (const r of lic.results ?? []) (licOf.get(r.publisher) ?? licOf.set(r.publisher, []).get(r.publisher)).push(r.market);

	const field = (df, key) => {
		try { return String((JSON.parse(df || '[]').find((x) => x.key === key)?.value) ?? '').trim(); } catch { return ''; }
	};
	const q = lc(f.q);
	const pub = lc(f.pub);
	const out = [];
	for (const s of sheets) {
		const sku = String(s.sku).trim();
		const key = sku.toLowerCase();
		const pfxPub = prefixMap.get(skuPrefix(sku)) ?? skuPrefix(sku) ?? null;
		const mappedPub = overrideMap.get(key) ?? pfxPub;
		const publisher = f.pubMode === 'sku' ? pfxPub : mappedPub;
		if (pub && lc(publisher) !== pub) continue;
		if (f.featured && !s.featured_at) continue;
		if (f.preorder && (f.preorder === 'yes') !== !!s.preorder_date) continue;
		if (f.restock && (f.restock === 'yes') !== !!s.restock_date) continue;
		const names = [s.name_en, s.name_da, s.name_sv, s.name_no].filter(Boolean);
		if (q && !key.includes(q) && !names.some((n) => lc(n).includes(q))) continue;

		// Effective webshop markets: explicit list (limited by the publisher
		// licence unless "override licence"), else everything the licence allows.
		const w = webOf.get(key);
		const licence = sanitizeMarkets(licOf.get(mappedPub) ?? []);
		let explicit = null;
		if (w?.published_markets != null) { try { explicit = sanitizeMarkets(JSON.parse(w.published_markets)); } catch { explicit = []; } }
		const markets = explicit == null ? licence : w?.override_license ? explicit : explicit.filter((m) => licence.includes(m));
		if (f.marketsNone || f.markets.length) {
			const ok = (f.marketsNone && !markets.length) || (f.markets.length && f.markets.some((m) => markets.includes(m)));
			if (!ok) continue;
		}

		const has = new Set(groupsOf.get(key) ?? []);
		const missing = [];
		if (!field(s.data_fields, 'age')) missing.push('age');
		if (!field(s.data_fields, 'time')) missing.push('time');
		if (!field(s.data_fields, 'players')) missing.push('players');
		if (!field(s.data_fields, 'pieces')) missing.push('pieces');
		if (managed.length && !managed.every((g) => has.has(g))) missing.push('category');
		if (!s.has_short) missing.push('short');
		if ((s.usp_count ?? 3) < 1 || (s.usp_filled ?? 0) < (s.usp_count ?? 3)) missing.push('bullets');
		if (!s.has_long) missing.push('long');
		if (f.missing.length) {
			const hit = f.missingMode === 'all' ? f.missing.every((k) => missing.includes(k)) : f.missing.some((k) => missing.includes(k));
			if (!hit) continue;
		}

		out.push({
			id: s.id, sku, box_image_key: s.box_image_key, updated_at: s.updated_at, featured_at: s.featured_at,
			name_en: s.name_en, name_da: s.name_da, name_sv: s.name_sv, name_no: s.name_no,
			publisher, markets, missing, preorder_date: s.preorder_date, restock_date: s.restock_date,
		});
	}
	out.sort((a, b) => (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0));
	return { total: sheets.length, sheets: out };
}
