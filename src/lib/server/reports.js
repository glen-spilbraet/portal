/**
 * Custom report computation against SALES_DB (deal_line_items + sales_deals).
 *
 * - Development chart: ALWAYS the current calendar year, month by month, vs last
 *   year (same shape as the Sales Stats dashboard). Does NOT react to the range.
 * - Figures (totals, by-market, best-seller pivot): for the selected window
 *   `cur` (default = current year to date), with `prior` (same window one year
 *   earlier) for YoY indexes.
 * Measures: revenue = SUM(amount_dkk) (DKK), units = SUM(quantity).
 */

const TOP_N = 15;
const MARKETS = ['Denmark', 'Sweden', 'Norway', 'International'];

const PUB_SKU = `COALESCE((SELECT pp.publisher FROM publisher_prefix pp WHERE pp.prefix = li.sku_prefix), li.sku_prefix)`;
const CAT_NAME = `(SELECT tr.value FROM sales_sheets s2 JOIN translations tr ON tr.sheet_id = s2.id
	WHERE lower(s2.sku) = lower(li.sku) AND tr.key = 'product_name' AND COALESCE(tr.value,'') != ''
	ORDER BY (tr.language = s2.primary_language) DESC LIMIT 1)`;
const sumExpr = `COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units`;

function rulePredicate(rules) {
	const binds = [];
	const frag = (r) => {
		if (r.kind === 'publisher_sku') { binds.push(r.value); return `${PUB_SKU} = ?`; }
		if (r.kind === 'publisher_mapped') { binds.push(r.value); return `li.publisher = ?`; }
		if (r.kind === '_skuset') { // pre-resolved name_contains → concrete SKU list
			if (!r.skus.length) return '0';
			binds.push(...r.skus);
			return `lower(li.sku) IN (${r.skus.map(() => '?').join(',')})`;
		}
		binds.push(String(r.value).toLowerCase()); return `lower(li.sku) = ?`; // kind === 'sku'
	};
	const inc = (rules ?? []).filter((r) => r.action === 'include');
	const exc = (rules ?? []).filter((r) => r.action === 'exclude');
	let clause = `li.deal_kind = 'closed'`;
	if (inc.length) clause += ` AND (${inc.map(frag).join(' OR ')})`;
	if (exc.length) clause += ` AND NOT (${exc.map(frag).join(' OR ')})`;
	return { clause, binds };
}

const minusYears = (d, n) => { const [y, m, dd] = d.split('-'); return `${Number(y) - n}-${m}-${dd}`; };

/** Default window = current year to date (end exclusive of today). */
function ytd(now = new Date()) {
	const y = now.getUTCFullYear();
	const today = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
	return { cur: { start: `${y}-01-01`, end: today }, prior: { start: `${y - 1}-01-01`, end: minusYears(today, 1) }, label: `${y} to date` };
}

async function totalsFor(db, clause, binds, s, e) {
	return db.prepare(
		`SELECT ${sumExpr}, COUNT(*) AS lines,
		        COUNT(DISTINCT CASE WHEN li.sku IS NOT NULL AND li.sku != '' THEN li.sku END) AS skus,
		        COUNT(DISTINCT li.company_id) AS stores
		 FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ?`
	).bind(...binds, s, e).first();
}
async function marketFor(db, clause, binds, s, e) {
	return (await db.prepare(`SELECT d.market AS market, ${sumExpr} FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? GROUP BY d.market`).bind(...binds, s, e).all()).results ?? [];
}
async function yearMonthly(db, clause, binds, year) {
	const rows = (await db.prepare(`SELECT substr(li.close_date,1,7) AS ym, ${sumExpr} FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? GROUP BY ym`).bind(...binds, `${year}-01-01`, `${year + 1}-01-01`).all()).results ?? [];
	const map = Object.fromEntries(rows.map((r) => [r.ym, r]));
	return Array.from({ length: 12 }, (_, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; return { revenue: map[k]?.revenue ?? 0, units: map[k]?.units ?? 0 }; });
}
async function totalsBySkuForMarkets(db, clause, binds, s, e, skus) {
	if (!skus.length) return [];
	const ph = skus.map(() => '?').join(',');
	return (await db.prepare(`SELECT li.sku AS sku, d.market AS market, ${sumExpr} FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IN (${ph}) GROUP BY li.sku, d.market`).bind(...binds, s, e, ...skus).all()).results ?? [];
}
async function totalsBySku(db, clause, binds, s, e, skus) {
	if (!skus.length) return {};
	const ph = skus.map(() => '?').join(',');
	const rows = (await db.prepare(`SELECT li.sku AS sku, ${sumExpr} FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IN (${ph}) GROUP BY li.sku`).bind(...binds, s, e, ...skus).all()).results ?? [];
	return Object.fromEntries(rows.map((r) => [r.sku, r]));
}

/** Resolve a "product name contains" term to the set of matching SKUs (from the
 * sales-sheet catalog) — done once, up front, so the heavy queries can filter by
 * `sku IN (...)` instead of a per-row correlated LIKE (which times out). */
async function resolveNameSkus(salesDb, term) {
	const t = `%${String(term).toLowerCase()}%`;
	const rows = (await salesDb.prepare(
		`SELECT DISTINCT lower(s.sku) AS sku FROM sales_sheets s JOIN translations tr ON tr.sheet_id = s.id
		 WHERE tr.key = 'product_name' AND lower(COALESCE(tr.value, '')) LIKE ? AND s.sku IS NOT NULL AND s.sku != ''`
	).bind(t).all()).results ?? [];
	return rows.map((r) => r.sku);
}

export async function computeReport(salesDb, rules, { metric = 'both', cur, prior, label } = {}) {
	// Pre-resolve name_contains rules to concrete SKU lists (fast catalog lookup).
	const resolved = [];
	for (const r of rules ?? []) {
		if (r.kind === 'name_contains') resolved.push({ ...r, kind: '_skuset', skus: await resolveNameSkus(salesDb, r.value) });
		else resolved.push(r);
	}
	const { clause, binds } = rulePredicate(resolved);
	const now = new Date();
	if (!cur) { const d = ytd(now); cur = d.cur; prior = d.prior; label = d.label; }
	const curYear = now.getUTCFullYear();
	const orderBy = metric === 'units' ? 'units' : 'revenue';
	const mZero = () => Object.fromEntries(MARKETS.map((m) => [m, { revenue: 0, units: 0 }]));

	// Development chart — calendar current year vs last year (independent of range).
	const [curMonthly, prevMonthly] = await Promise.all([
		yearMonthly(salesDb, clause, binds, curYear),
		yearMonthly(salesDb, clause, binds, curYear - 1),
	]);
	const chart = {
		year: curYear,
		monthly: Array.from({ length: 12 }, (_, i) => ({
			month: i + 1,
			revenue: curMonthly[i].revenue, units: curMonthly[i].units,
			revenuePrev: prevMonthly[i].revenue, unitsPrev: prevMonthly[i].units,
		})),
	};

	// Range figures.
	const [totalsCur, totalsPrev, mktCur, mktPrev] = await Promise.all([
		totalsFor(salesDb, clause, binds, cur.start, cur.end),
		totalsFor(salesDb, clause, binds, prior.start, prior.end),
		marketFor(salesDb, clause, binds, cur.start, cur.end),
		marketFor(salesDb, clause, binds, prior.start, prior.end),
	]);
	const mkCur = mZero(), mkPrev = mZero();
	for (const r of mktCur) { const m = MARKETS.includes(r.market) ? r.market : 'International'; mkCur[m].revenue += r.revenue; mkCur[m].units += r.units; }
	for (const r of mktPrev) { const m = MARKETS.includes(r.market) ? r.market : 'International'; mkPrev[m].revenue += r.revenue; mkPrev[m].units += r.units; }
	const market = MARKETS.map((m) => ({ market: m, revenue: mkCur[m].revenue, units: mkCur[m].units, revenuePrev: mkPrev[m].revenue, unitsPrev: mkPrev[m].units }));

	// Best-seller pivot: top SKUs (by primary) with per-market split + total + prior.
	const topCur = (await salesDb.prepare(
		`SELECT li.sku AS sku, COALESCE(${CAT_NAME}, MAX(li.name)) AS name, ${sumExpr}
		 FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IS NOT NULL AND li.sku != ''
		 GROUP BY li.sku ORDER BY ${orderBy} DESC LIMIT ${TOP_N}`
	).bind(...binds, cur.start, cur.end).all()).results ?? [];
	const skus = topCur.map((p) => p.sku);
	const [pivotRows, priorBySku] = await Promise.all([
		totalsBySkuForMarkets(salesDb, clause, binds, cur.start, cur.end, skus),
		totalsBySku(salesDb, clause, binds, prior.start, prior.end, skus),
	]);
	const bySku = {};
	for (const p of topCur) bySku[p.sku] = { sku: p.sku, name: p.name, total: { revenue: p.revenue, units: p.units }, totalPrev: { revenue: priorBySku[p.sku]?.revenue ?? 0, units: priorBySku[p.sku]?.units ?? 0 }, markets: mZero() };
	for (const r of pivotRows) { const m = MARKETS.includes(r.market) ? r.market : 'International'; const row = bySku[r.sku]; if (row) { row.markets[m].revenue += r.revenue; row.markets[m].units += r.units; } }
	const topProducts = topCur.map((p) => bySku[p.sku]);

	return {
		markets: MARKETS,
		period: { label: label ?? 'Year to date', start: cur.start, end: cur.end },
		chart,
		totals: { revenue: totalsCur?.revenue ?? 0, units: totalsCur?.units ?? 0, lines: totalsCur?.lines ?? 0, skus: totalsCur?.skus ?? 0, stores: totalsCur?.stores ?? 0, revenuePrev: totalsPrev?.revenue ?? 0, unitsPrev: totalsPrev?.units ?? 0 },
		market,
		topProducts,
	};
}
