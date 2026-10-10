/**
 * Custom report computation — runs the report's include/exclude rules against
 * SALES_DB (deal_line_items, JOIN sales_deals for market). Period: rolling last
 * 12 calendar months, with the preceding 12 months computed too for YoY indexes.
 * Measures: revenue = SUM(amount_dkk) (DKK), units = SUM(quantity).
 */

const TOP_N = 12;
const MARKETS = ['Denmark', 'Sweden', 'Norway', 'International'];

const PUB_SKU = `COALESCE((SELECT pp.publisher FROM publisher_prefix pp WHERE pp.prefix = li.sku_prefix), li.sku_prefix)`;
const CAT_NAME = `(SELECT tr.value FROM sales_sheets s2 JOIN translations tr ON tr.sheet_id = s2.id
	WHERE lower(s2.sku) = lower(li.sku) AND tr.key = 'product_name' AND COALESCE(tr.value,'') != ''
	ORDER BY (tr.language = s2.primary_language) DESC LIMIT 1)`;

function rulePredicate(rules) {
	const binds = [];
	const frag = (r) => {
		if (r.kind === 'publisher_sku') { binds.push(r.value); return `${PUB_SKU} = ?`; }
		if (r.kind === 'publisher_mapped') { binds.push(r.value); return `li.publisher = ?`; }
		binds.push(String(r.value).toLowerCase()); return `lower(li.sku) = ?`;
	};
	const inc = (rules ?? []).filter((r) => r.action === 'include');
	const exc = (rules ?? []).filter((r) => r.action === 'exclude');
	let clause = `li.deal_kind = 'closed'`;
	if (inc.length) clause += ` AND (${inc.map(frag).join(' OR ')})`;
	if (exc.length) clause += ` AND NOT (${exc.map(frag).join(' OR ')})`;
	return { clause, binds };
}

/** Current + previous rolling-12-month windows and their aligned YYYY-MM buckets. */
function windows() {
	const now = new Date();
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	const prevStart = new Date(Date.UTC(start.getUTCFullYear() - 1, start.getUTCMonth(), 1));
	const months = [], prevMonths = [];
	for (let i = 0; i < 12; i++) {
		const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
		months.push(d.toISOString().slice(0, 7));
		prevMonths.push(new Date(Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1)).toISOString().slice(0, 7));
	}
	const ymd = (d) => d.toISOString().slice(0, 10);
	return { start: ymd(start), end: ymd(end), prevStart: ymd(prevStart), prevEnd: ymd(start), months, prevMonths };
}

const sumExpr = `COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units`;

async function totalsFor(db, clause, binds, s, e) {
	return db.prepare(`SELECT ${sumExpr}, COUNT(*) AS lines FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ?`).bind(...binds, s, e).first();
}
async function monthlyFor(db, clause, binds, s, e) {
	return (await db.prepare(`SELECT substr(li.close_date,1,7) AS ym, ${sumExpr} FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? GROUP BY ym`).bind(...binds, s, e).all()).results ?? [];
}
async function marketFor(db, clause, binds, s, e) {
	return (await db.prepare(`SELECT d.market AS market, ${sumExpr} FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? GROUP BY d.market`).bind(...binds, s, e).all()).results ?? [];
}
async function prevForSkus(db, clause, binds, s, e, skus) {
	if (!skus.length) return {};
	const ph = skus.map(() => '?').join(',');
	const rows = (await db.prepare(`SELECT li.sku AS sku, ${sumExpr} FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IN (${ph}) GROUP BY li.sku`).bind(...binds, s, e, ...skus).all()).results ?? [];
	return Object.fromEntries(rows.map((r) => [r.sku, r]));
}

export async function computeReport(salesDb, rules, { metric = 'both' } = {}) {
	const { clause, binds } = rulePredicate(rules);
	const { start, end, prevStart, prevEnd, months, prevMonths } = windows();

	const [totalsCur, totalsPrev, monCur, monPrev, mktCur, mktPrev] = await Promise.all([
		totalsFor(salesDb, clause, binds, start, end),
		totalsFor(salesDb, clause, binds, prevStart, prevEnd),
		monthlyFor(salesDb, clause, binds, start, end),
		monthlyFor(salesDb, clause, binds, prevStart, prevEnd),
		marketFor(salesDb, clause, binds, start, end),
		marketFor(salesDb, clause, binds, prevStart, prevEnd),
	]);

	const curMap = Object.fromEntries(monCur.map((r) => [r.ym, r]));
	const prevMap = Object.fromEntries(monPrev.map((r) => [r.ym, r]));
	const monthly = months.map((ym, i) => ({
		ym,
		revenue: curMap[ym]?.revenue ?? 0, units: curMap[ym]?.units ?? 0,
		revenuePrev: prevMap[prevMonths[i]]?.revenue ?? 0, unitsPrev: prevMap[prevMonths[i]]?.units ?? 0,
	}));

	const orderBy = metric === 'units' ? 'units' : 'revenue';
	const topCur = (await salesDb.prepare(
		`SELECT li.sku AS sku, COALESCE(${CAT_NAME}, MAX(li.name)) AS name, ${sumExpr}
		 FROM deal_line_items li WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IS NOT NULL AND li.sku != ''
		 GROUP BY li.sku ORDER BY ${orderBy} DESC LIMIT ${TOP_N}`
	).bind(...binds, start, end).all()).results ?? [];
	const topPrev = await prevForSkus(salesDb, clause, binds, prevStart, prevEnd, topCur.map((p) => p.sku));
	const topProducts = topCur.map((p) => ({ ...p, revenuePrev: topPrev[p.sku]?.revenue ?? 0, unitsPrev: topPrev[p.sku]?.units ?? 0 }));

	const marketCurMap = Object.fromEntries(mktCur.map((r) => [MARKETS.includes(r.market) ? r.market : 'International', r]));
	const marketPrevAgg = Object.fromEntries(MARKETS.map((m) => [m, { revenue: 0, units: 0 }]));
	for (const r of mktPrev) { const m = MARKETS.includes(r.market) ? r.market : 'International'; marketPrevAgg[m].revenue += r.revenue; marketPrevAgg[m].units += r.units; }
	const market = MARKETS.map((m) => ({
		market: m,
		revenue: marketCurMap[m]?.revenue ?? 0, units: marketCurMap[m]?.units ?? 0,
		revenuePrev: marketPrevAgg[m].revenue, unitsPrev: marketPrevAgg[m].units,
	}));

	return {
		period: { start, end, label: 'Last 12 months' },
		totals: {
			revenue: totalsCur?.revenue ?? 0, units: totalsCur?.units ?? 0, lines: totalsCur?.lines ?? 0,
			revenuePrev: totalsPrev?.revenue ?? 0, unitsPrev: totalsPrev?.units ?? 0,
		},
		monthly, topProducts, market,
	};
}
