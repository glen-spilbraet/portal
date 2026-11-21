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
import { TEXT_JOIN_SQL, TEXT_COLUMNS_SQL, loadMarketResolver, requiredLangs, missingTexts } from '$lib/server/sheetTexts.js';
import { LANGS, sheetNames } from '$lib/languages.js';

export const MISSING_KEYS = ['age', 'time', 'players', 'pieces', 'gametype', 'type', 'short', 'bullets', 'long'];
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
	// ── Sheets + texts (every language) + names, one aggregate pass ───────────
	// Texts are checked in the languages of the sheet's published markets (sheetTexts.js).
	const sheets = (await db.prepare(
		`SELECT s.id, s.sku, COALESCE(NULLIF(s.box_image_key, ''), NULLIF(s.box_flat_image_key, '')) AS box_image_key, s.updated_at, s.featured_at, s.data_fields,
		        s.preorder_date, s.restock_date, COALESCE(s.usp_count, 3) AS usp_count, s.primary_language,
		        ${LANGS.map((l) => `(SELECT value FROM translations WHERE sheet_id = s.id AND language = '${l}' AND key = 'product_name') AS name_${l}`).join(',\n\t\t        ')},
		        ${TEXT_COLUMNS_SQL}
		 FROM sales_sheets s
		 LEFT JOIN translations tx ON tx.sheet_id = s.id AND ${TEXT_JOIN_SQL}
		 WHERE trim(COALESCE(s.sku, '')) != ''
		 GROUP BY s.id`
	).all()).results ?? [];

	// ── SALES_DB lookups: mapping, category groups, webshop state ──────────
	const [groups, cats, marketsOf] = await Promise.all([
		salesDb.prepare(`SELECT g.id, lower(COALESCE((SELECT label FROM category_label WHERE object_type = 'group' AND object_id = g.id AND language = 'en'),
		                   (SELECT label FROM category_label WHERE object_type = 'group' AND object_id = g.id AND language = 'da'), '')) AS name
		                 FROM category_group g`).all().catch(() => ({ results: [] })),
		salesDb.prepare('SELECT lower(pc.sku) AS sku, c.group_id FROM product_category pc JOIN category c ON c.id = pc.category_id').all().catch(() => ({ results: [] })),
		loadMarketResolver(salesDb),
	]);
	// The two managed category groups, checked separately ("Game Type", "Type").
	const groupId = (name) => (groups.results ?? []).find((g) => g.name === name)?.id ?? null;
	const gameTypeGroup = groupId('game type');
	const typeGroup = groupId('type');
	const groupsOf = new Map();
	for (const r of cats.results ?? []) (groupsOf.get(r.sku) ?? groupsOf.set(r.sku, new Set()).get(r.sku)).add(r.group_id);

	const field = (df, key) => {
		try { return String((JSON.parse(df || '[]').find((x) => x.key === key)?.value) ?? '').trim(); } catch { return ''; }
	};
	const q = lc(f.q);
	const pub = lc(f.pub);
	const out = [];
	for (const s of sheets) {
		const sku = String(s.sku).trim();
		const key = sku.toLowerCase();
		const { pfxPub, mappedPub, markets } = marketsOf(sku);
		const publisher = f.pubMode === 'sku' ? pfxPub : mappedPub;
		if (pub && lc(publisher) !== pub) continue;
		if (f.featured && !s.featured_at) continue;
		if (f.preorder && (f.preorder === 'yes') !== !!s.preorder_date) continue;
		if (f.restock && (f.restock === 'yes') !== !!s.restock_date) continue;
		const names = sheetNames(s);
		if (q && !key.includes(q) && !names.some((n) => lc(n).includes(q))) continue;

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
		if (gameTypeGroup && !has.has(gameTypeGroup)) missing.push('gametype');
		if (typeGroup && !has.has(typeGroup)) missing.push('type');
		missing.push(...missingTexts(s, requiredLangs(markets, s.primary_language)));
		if (f.missing.length) {
			const hit = f.missingMode === 'all' ? f.missing.every((k) => missing.includes(k)) : f.missing.some((k) => missing.includes(k));
			if (!hit) continue;
		}

		out.push({
			id: s.id, sku, box_image_key: s.box_image_key, updated_at: s.updated_at, featured_at: s.featured_at,
			...Object.fromEntries(LANGS.map((l) => [`name_${l}`, s[`name_${l}`]])),
			publisher, markets, missing, preorder_date: s.preorder_date, restock_date: s.restock_date,
		});
	}
	out.sort((a, b) => (Number(b.updated_at) || 0) - (Number(a.updated_at) || 0));
	return { total: sheets.length, sheets: out };
}
