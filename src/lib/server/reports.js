/**
 * Custom report computation — runs the report's include/exclude rules against
 * SALES_DB (deal_line_items, JOIN sales_deals for market). Period: rolling last
 * 12 calendar months. Measures: revenue = SUM(amount_dkk) (DKK), units =
 * SUM(quantity). Report definitions (name/metric/rules) live in the app DB.
 */

const TOP_N = 12;
const MARKETS = ['Denmark', 'Sweden', 'Norway', 'International'];

// Per-line publisher expressions (alias li.): prefix model vs the stored/mapped value.
const PUB_SKU = `COALESCE((SELECT pp.publisher FROM publisher_prefix pp WHERE pp.prefix = li.sku_prefix), li.sku_prefix)`;
// Catalog product name for a SKU (sales sheet translation), else the line text.
const CAT_NAME = `(SELECT tr.value FROM sales_sheets s2 JOIN translations tr ON tr.sheet_id = s2.id
	WHERE lower(s2.sku) = lower(li.sku) AND tr.key = 'product_name' AND COALESCE(tr.value,'') != ''
	ORDER BY (tr.language = s2.primary_language) DESC LIMIT 1)`;

/** Build the include/exclude WHERE fragment (closed line items only). */
function rulePredicate(rules) {
	const binds = [];
	const frag = (r) => {
		if (r.kind === 'publisher_sku') { binds.push(r.value); return `${PUB_SKU} = ?`; }
		if (r.kind === 'publisher_mapped') { binds.push(r.value); return `li.publisher = ?`; }
		binds.push(String(r.value).toLowerCase()); return `lower(li.sku) = ?`; // kind === 'sku'
	};
	const inc = (rules ?? []).filter((r) => r.action === 'include');
	const exc = (rules ?? []).filter((r) => r.action === 'exclude');
	let clause = `li.deal_kind = 'closed'`;
	if (inc.length) clause += ` AND (${inc.map(frag).join(' OR ')})`;
	if (exc.length) clause += ` AND NOT (${exc.map(frag).join(' OR ')})`;
	return { clause, binds };
}

/** Rolling last 12 calendar months → window + the 12 YYYY-MM buckets. */
function rolling12() {
	const now = new Date();
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	const months = [];
	for (let i = 0; i < 12; i++) {
		const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
		months.push(d.toISOString().slice(0, 7));
	}
	return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), months };
}

/** Compute all report figures for the given rules. `metric` only affects top-product ordering. */
export async function computeReport(salesDb, rules, { metric = 'both' } = {}) {
	const { clause, binds } = rulePredicate(rules);
	const { start, end, months } = rolling12();
	const where = `${clause} AND li.close_date >= ? AND li.close_date < ?`;
	const wb = [...binds, start, end];

	const totals = await salesDb.prepare(
		`SELECT COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units, COUNT(*) AS lines
		 FROM deal_line_items li WHERE ${where}`
	).bind(...wb).first();

	const monthlyRows = (await salesDb.prepare(
		`SELECT substr(li.close_date,1,7) AS ym, COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units
		 FROM deal_line_items li WHERE ${where} GROUP BY ym`
	).bind(...wb).all()).results ?? [];
	const mMap = Object.fromEntries(monthlyRows.map((r) => [r.ym, r]));
	const monthly = months.map((ym) => ({ ym, revenue: mMap[ym]?.revenue ?? 0, units: mMap[ym]?.units ?? 0 }));

	const orderBy = metric === 'units' ? 'units' : 'revenue';
	const topProducts = (await salesDb.prepare(
		`SELECT li.sku AS sku, COALESCE(${CAT_NAME}, MAX(li.name)) AS name,
		        COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units
		 FROM deal_line_items li WHERE ${where} AND li.sku IS NOT NULL AND li.sku != ''
		 GROUP BY li.sku ORDER BY ${orderBy} DESC LIMIT ${TOP_N}`
	).bind(...wb).all()).results ?? [];

	const marketRows = (await salesDb.prepare(
		`SELECT d.market AS market, COALESCE(SUM(li.amount_dkk),0) AS revenue, COALESCE(SUM(li.quantity),0) AS units
		 FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id
		 WHERE ${where} GROUP BY d.market`
	).bind(...wb).all()).results ?? [];
	const marketMap = Object.fromEntries(MARKETS.map((m) => [m, { revenue: 0, units: 0 }]));
	for (const r of marketRows) {
		const m = MARKETS.includes(r.market) ? r.market : 'International';
		marketMap[m].revenue += r.revenue; marketMap[m].units += r.units;
	}
	const market = MARKETS.map((m) => ({ market: m, ...marketMap[m] }));

	return {
		period: { start, end, label: 'Last 12 months' },
		totals: { revenue: totals?.revenue ?? 0, units: totals?.units ?? 0, lines: totals?.lines ?? 0 },
		monthly,
		topProducts,
		market,
	};
}
