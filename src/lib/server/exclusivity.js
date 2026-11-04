/**
 * Exclusivity agreements — a SKU sold only to certain customer(s) in a market,
 * optionally for a period. Lives on SALES_DB (shared prod portal-db), like the
 * publisher registry and webshop markets, so agreements entered anywhere are
 * the real ones.
 *
 *   exclusivity_deal  — sku, market, start/end date (inclusive, both optional), note
 *   exclusivity_party — the customers: whole customer groups or single companies
 *
 * Status is derived from the dates: upcoming (starts after today), expired
 * (ended before today), otherwise active. No end date = active until ended.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

import { MARKETS } from '$lib/server/webshopMarkets.js';

export { MARKETS };
export const MARKET_LABEL = { DK: 'Denmark', SE: 'Sweden', NO: 'Norway', INT: 'International', PL: 'Poland' };
// sales_deals.market values (derived from company country) per market code.
const SALES_MARKET = { DK: 'Denmark', SE: 'Sweden', NO: 'Norway', INT: 'International', PL: 'International' };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalise an agreement payload. Returns { value } or { error }. */
export function cleanDeal(body) {
	const sku = String(body?.sku ?? '').trim();
	const market = String(body?.market ?? '').trim().toUpperCase();
	const start = body?.start_date ? String(body.start_date) : null;
	const end = body?.end_date ? String(body.end_date) : null;
	const parties = Array.isArray(body?.parties) ? body.parties : [];
	if (!sku) return { error: 'SKU is required' };
	if (!MARKETS.includes(market)) return { error: 'Pick a market' };
	if (start && !YMD.test(start)) return { error: 'Invalid start date' };
	if (end && !YMD.test(end)) return { error: 'Invalid end date' };
	if (start && end && end < start) return { error: 'End date is before the start date' };
	const seen = new Set();
	const cleanParties = [];
	for (const p of parties) {
		const kind = p?.kind === 'group' ? 'group' : p?.kind === 'company' ? 'company' : null;
		const ref = String(p?.ref ?? '').trim();
		if (!kind || !ref || seen.has(`${kind}:${ref}`)) continue;
		seen.add(`${kind}:${ref}`);
		cleanParties.push({ kind, ref, label: String(p?.label ?? ref).trim() || ref });
	}
	if (!cleanParties.length) return { error: 'Add at least one customer' };
	return {
		value: {
			sku, market, start_date: start, end_date: end,
			product_name: body?.product_name ? String(body.product_name).trim() : null,
			note: body?.note ? String(body.note).trim() : null,
			parties: cleanParties,
		},
	};
}

/** All agreements with their customers. @param {D1} db */
export async function listDeals(db) {
	const [deals, parties] = await Promise.all([
		db.prepare('SELECT * FROM exclusivity_deal ORDER BY sku COLLATE NOCASE, market').all(),
		db.prepare('SELECT deal_id, kind, ref, label FROM exclusivity_party ORDER BY kind DESC, label COLLATE NOCASE').all(),
	]);
	const byDeal = new Map();
	for (const p of parties.results ?? []) {
		if (!byDeal.has(p.deal_id)) byDeal.set(p.deal_id, []);
		byDeal.get(p.deal_id).push({ kind: p.kind, ref: p.ref, label: p.label });
	}
	return (deals.results ?? []).map((d) => ({ ...d, parties: byDeal.get(d.id) ?? [] }));
}

function partyStmts(db, id, parties) {
	return parties.map((p) =>
		db.prepare('INSERT INTO exclusivity_party (deal_id, kind, ref, label) VALUES (?, ?, ?, ?)').bind(id, p.kind, p.ref, p.label)
	);
}

/** @param {D1} db */
export async function createDeal(db, v, userEmail) {
	const id = crypto.randomUUID();
	await db.batch([
		db.prepare(
			`INSERT INTO exclusivity_deal (id, sku, product_name, market, start_date, end_date, note, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(id, v.sku, v.product_name, v.market, v.start_date, v.end_date, v.note, userEmail ?? null),
		...partyStmts(db, id, v.parties),
	]);
	return id;
}

/** @param {D1} db */
export async function updateDeal(db, id, v) {
	await db.batch([
		db.prepare(
			`UPDATE exclusivity_deal SET sku = ?, product_name = ?, market = ?, start_date = ?, end_date = ?, note = ?,
			   updated_at = datetime('now') WHERE id = ?`
		).bind(v.sku, v.product_name, v.market, v.start_date, v.end_date, v.note, id),
		db.prepare('DELETE FROM exclusivity_party WHERE deal_id = ?').bind(id),
		...partyStmts(db, id, v.parties),
	]);
}

/** @param {D1} db */
export async function deleteDeal(db, id) {
	await db.batch([
		db.prepare('DELETE FROM exclusivity_party WHERE deal_id = ?').bind(id),
		db.prepare('DELETE FROM exclusivity_deal WHERE id = ?').bind(id),
	]);
}

/**
 * Customer search for the picker: customer groups (whole chains) and single
 * companies from the HubSpot sales mirror. Companies in the chosen market sort
 * first. @param {D1} db
 */
export async function searchParties(db, q, market) {
	const like = `%${q.toLowerCase()}%`;
	const salesMarket = SALES_MARKET[market] ?? '';
	const [groups, companies] = await Promise.all([
		db.prepare(
			`SELECT customer_group AS name, COUNT(DISTINCT company_id) AS n,
			        SUM(CASE WHEN market = ? THEN 1 ELSE 0 END) AS in_market
			 FROM sales_deals
			 WHERE customer_group IS NOT NULL AND customer_group <> '' AND lower(customer_group) LIKE ?
			 GROUP BY customer_group ORDER BY in_market > 0 DESC, name COLLATE NOCASE LIMIT 8`
		).bind(salesMarket, like).all(),
		db.prepare(
			`SELECT company_id AS id, company_name AS name, MAX(customer_group) AS grp, MAX(country) AS country, MAX(market) AS market
			 FROM sales_deals
			 WHERE company_id IS NOT NULL AND company_name IS NOT NULL AND company_name <> '' AND lower(company_name) LIKE ?
			 GROUP BY company_id ORDER BY MAX(market) = ? DESC, name COLLATE NOCASE LIMIT 12`
		).bind(like, salesMarket).all(),
	]);
	return [
		...(groups.results ?? []).map((g) => ({ kind: 'group', ref: g.name, label: g.name, hint: `Group · ${g.n} ${g.n === 1 ? 'company' : 'companies'}` })),
		...(companies.results ?? []).map((c) => ({
			kind: 'company', ref: String(c.id), label: c.name,
			hint: ['Company', c.grp, c.country].filter(Boolean).join(' · '),
		})),
	];
}

/**
 * Canonical product names from Sheets (app DB) for a set of SKUs, primary
 * language first. D1 can't join across databases, so this is a separate read.
 * @param {D1 | undefined} appDb
 */
export async function sheetNames(appDb, skus) {
	const m = new Map();
	const list = [...new Set(skus.filter(Boolean).map((s) => String(s).toLowerCase()))];
	if (!appDb || !list.length) return m;
	try {
		for (let i = 0; i < list.length; i += 90) {
			const part = list.slice(i, i + 90);
			const rows = (await appDb.prepare(
				`SELECT lower(s.sku) AS sku, tr.value AS name FROM sales_sheets s JOIN translations tr ON tr.sheet_id = s.id
				 WHERE tr.key = 'product_name' AND COALESCE(tr.value,'') != '' AND lower(s.sku) IN (${part.map(() => '?').join(',')})
				 ORDER BY (tr.language = s.primary_language) ASC`
			).bind(...part).all()).results ?? [];
			for (const r of rows) m.set(r.sku, r.name); // primary language sorts last → wins
		}
	} catch { /* fall back to stored snapshot names */ }
	return m;
}
