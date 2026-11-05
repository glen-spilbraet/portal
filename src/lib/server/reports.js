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
		if (r.kind === 'series') { binds.push(r.value); return `li.series_id = ?`; } // value = series id

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
	// COALESCE: a NULL comparison (e.g. a line with no series or publisher) must
	// count as "not excluded" — plain NOT (NULL) would silently drop it.
	if (exc.length) clause += ` AND NOT COALESCE((${exc.map(frag).join(' OR ')}), 0)`;
	return { clause, binds };
}

const minusYears = (d, n) => { const [y, m, dd] = d.split('-'); return `${Number(y) - n}-${m}-${dd}`; };

/** Default window = current year to date (end exclusive of today). */
function ytd(now = new Date()) {
	const y = now.getUTCFullYear();
	const today = new Date(Date.UTC(y, now.getUTCMonth(), now.getUTCDate())).toISOString().slice(0, 10);
	return { cur: { start: `${y}-01-01`, end: today }, prior: { start: `${y - 1}-01-01`, end: minusYears(today, 1) }, label: `${y} to date` };
}

/** Canonical sheet names for a few SKUs (primary language wins). */
async function catalogNames(db, skus) {
	const m = new Map();
	const list = [...new Set(skus.map((s) => String(s).toLowerCase()))];
	if (!list.length) return m;
	const rows = (await db.prepare(
		`SELECT lower(s.sku) AS sku, tr.value AS name FROM sales_sheets s JOIN translations tr ON tr.sheet_id = s.id
		 WHERE tr.key = 'product_name' AND COALESCE(tr.value,'') != '' AND lower(s.sku) IN (${list.map(() => '?').join(',')})
		 ORDER BY (tr.language = s.primary_language) ASC`
	).bind(...list).all()).results ?? [];
	for (const r of rows) m.set(r.sku, r.name); // primary language sorts last → wins
	return m;
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

/** Build the WHERE clause + binds for a rule set, pre-resolving name_contains
 * rules to concrete SKU lists (fast catalog lookup) once up front. */
async function buildPredicate(salesDb, rules) {
	const resolved = [];
	for (const r of rules ?? []) {
		if (r.kind === 'name_contains') resolved.push({ ...r, kind: '_skuset', skus: await resolveNameSkus(salesDb, r.value) });
		else resolved.push(r);
	}
	return rulePredicate(resolved);
}

export async function computeReport(salesDb, rules, { metric = 'both', cur, prior, label } = {}) {
	const { clause, binds } = await buildPredicate(salesDb, rules);
	const now = new Date();
	if (!cur) { const d = ytd(now); cur = d.cur; prior = d.prior; label = d.label; }
	const curYear = now.getUTCFullYear();
	const orderBy = metric === 'units' ? 'units' : 'revenue';
	const mZero = () => Object.fromEntries(MARKETS.map((m) => [m, { revenue: 0, units: 0 }]));
	const mk = (m) => (MARKETS.includes(m) ? m : 'International');

	// Four passes instead of a dozen — on an unfiltered report each pass scans
	// every closed line of the period, and too many at once trips D1's
	// "overloaded" limit (shared with the sales stats). Products, markets,
	// totals and series are all derived from ONE grouped pass per period.
	const pivotFor = (r) => salesDb.prepare(
		`SELECT li.sku AS sku, li.series_id AS sid, d.market AS market, MAX(li.name) AS name,
		        MAX(se.name) AS sname, MAX(se.publisher) AS spub, COUNT(*) AS lines, ${sumExpr}
		 FROM deal_line_items li
		 LEFT JOIN sales_deals d ON d.deal_id = li.deal_id
		 LEFT JOIN series se ON se.id = li.series_id
		 WHERE ${clause} AND li.close_date >= ? AND li.close_date < ?
		 GROUP BY li.sku, li.series_id, d.market`
	).bind(...binds, r.start, r.end).all();
	const [chartRes, curRes, priorRes, stores] = await Promise.all([
		// Development chart: calendar current year vs last year (independent of range), one pass.
		salesDb.prepare(
			`SELECT substr(li.close_date,1,7) AS ym, ${sumExpr} FROM deal_line_items li
			 WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? GROUP BY ym`
		).bind(...binds, `${curYear - 1}-01-01`, `${curYear + 1}-01-01`).all(),
		pivotFor(cur),
		pivotFor(prior),
		salesDb.prepare(
			`SELECT COUNT(DISTINCT CASE WHEN li.close_date >= ? AND li.close_date < ? THEN li.company_id END) AS cur,
			        COUNT(DISTINCT CASE WHEN li.close_date >= ? AND li.close_date < ? THEN li.company_id END) AS prev
			 FROM deal_line_items li
			 WHERE ${clause} AND ((li.close_date >= ? AND li.close_date < ?) OR (li.close_date >= ? AND li.close_date < ?))`
		).bind(cur.start, cur.end, prior.start, prior.end, ...binds, cur.start, cur.end, prior.start, prior.end).first(),
	]);

	const byYm = Object.fromEntries((chartRes.results ?? []).map((r) => [r.ym, r]));
	const ymKey = (y, i) => `${y}-${String(i + 1).padStart(2, '0')}`;
	const chart = {
		year: curYear,
		monthly: Array.from({ length: 12 }, (_, i) => {
			const c = byYm[ymKey(curYear, i)], p = byYm[ymKey(curYear - 1, i)];
			return { month: i + 1, revenue: c?.revenue ?? 0, units: c?.units ?? 0, revenuePrev: p?.revenue ?? 0, unitsPrev: p?.units ?? 0 };
		}),
	};

	// Fold one period's grouped rows into totals / markets / per-SKU / per-series.
	function fold(rows) {
		const out = { revenue: 0, units: 0, lines: 0, skus: new Set(), market: mZero(), bySku: new Map(), bySeries: new Map() };
		for (const r of rows) {
			const rev = r.revenue || 0, un = r.units || 0, m = mk(r.market);
			out.revenue += rev; out.units += un; out.lines += r.lines || 0;
			out.market[m].revenue += rev; out.market[m].units += un;
			if (r.sku) {
				out.skus.add(r.sku);
				let p = out.bySku.get(r.sku);
				if (!p) out.bySku.set(r.sku, (p = { sku: r.sku, name: r.name, total: { revenue: 0, units: 0 }, markets: mZero() }));
				if (!p.name && r.name) p.name = r.name;
				p.total.revenue += rev; p.total.units += un;
				p.markets[m].revenue += rev; p.markets[m].units += un;
			}
			const key = r.sid ?? '';
			let s = out.bySeries.get(key);
			if (!s) out.bySeries.set(key, (s = {
				id: r.sid ?? null, name: r.sid ? (r.sname ?? 'Unknown series') : 'No series', publisher: r.sid ? (r.spub ?? '') : '',
				none: !r.sid, skuSet: new Set(), total: { revenue: 0, units: 0 }, markets: mZero(),
			}));
			if (r.sku) s.skuSet.add(r.sku);
			s.total.revenue += rev; s.total.units += un;
			s.markets[m].revenue += rev; s.markets[m].units += un;
		}
		return out;
	}
	const c = fold(curRes.results ?? []);
	const p = fold(priorRes.results ?? []);

	const market = MARKETS.map((m) => ({
		market: m, revenue: c.market[m].revenue, units: c.market[m].units,
		revenuePrev: p.market[m].revenue, unitsPrev: p.market[m].units,
	}));

	// Best sellers: top SKUs by the report's primary measure, names from Sheets.
	const other = orderBy === 'units' ? 'revenue' : 'units'; // stable tie-break: other measure, then SKU
	const top = [...c.bySku.values()]
		.sort((a, b) => (b.total[orderBy] - a.total[orderBy]) || (b.total[other] - a.total[other]) || a.sku.localeCompare(b.sku))
		.slice(0, TOP_N);
	const names = await catalogNames(salesDb, top.map((t) => t.sku));
	const topProducts = top.map((t) => ({
		sku: t.sku,
		name: names.get(t.sku.toLowerCase()) ?? t.name,
		total: t.total,
		totalPrev: { revenue: p.bySku.get(t.sku)?.total.revenue ?? 0, units: p.bySku.get(t.sku)?.total.units ?? 0 },
		markets: t.markets,
	}));

	// Series pivot (+ "No series" bucket so it adds up). Empty when no product in
	// the report belongs to a series → the UI hides the Series tab.
	const seriesOut = [...c.bySeries.values()].map((s) => ({
		id: s.id, name: s.name, publisher: s.publisher, none: s.none, skus: s.skuSet.size,
		total: s.total, markets: s.markets,
		totalPrev: { revenue: p.bySeries.get(s.id ?? '')?.total.revenue ?? 0, units: p.bySeries.get(s.id ?? '')?.total.units ?? 0 },
	}));
	const named = seriesOut.filter((s) => !s.none);
	const topSeries = named.length ? [...named, ...seriesOut.filter((s) => s.none)] : [];

	return {
		markets: MARKETS,
		period: { label: label ?? 'Year to date', start: cur.start, end: cur.end },
		chart,
		totals: {
			revenue: c.revenue, units: c.units, lines: c.lines,
			skus: c.skus.size, stores: stores?.cur ?? 0,
			revenuePrev: p.revenue, unitsPrev: p.units,
			skusPrev: p.skus.size, storesPrev: stores?.prev ?? 0,
		},
		market,
		topProducts,
		topSeries,
	};
}

// ─── Export: products in rows, one column per country ───────────────────────
// Same layout as the on-screen best-sellers pivot, but covering ALL matching
// products and splitting the "International" bucket into its individual
// countries (DK/SE/NO stay as their own columns). Used for the CSV download.

const CC = { Denmark: 'DK', Sweden: 'SE', Norway: 'NO' }; // short labels for the big three

export async function computeExport(salesDb, rules, { measure = 'units', cur, prior, by = 'product' } = {}) {
	const m = measure === 'revenue' ? 'revenue' : 'units';
	const col = m === 'revenue' ? 'li.amount_dkk' : 'li.quantity';
	const { clause, binds } = await buildPredicate(salesDb, rules);
	const now = new Date();
	if (!cur) { const d = ytd(now); cur = d.cur; prior = d.prior; }

	// Keep DK/SE/NO on their market label; everything else breaks out by the raw
	// company country (blank → "Unknown") instead of collapsing to International.
	const bucket = `CASE WHEN d.market IN ('Denmark','Sweden','Norway') THEN d.market
	                     ELSE COALESCE(NULLIF(TRIM(d.country),''), 'Unknown') END`;
	// by = 'series': one row per series (publisher in the SKU column, products
	// without a series as "No series"); otherwise one row per product.
	const rows = by === 'series'
		? (await salesDb.prepare(
			`SELECT COALESCE(li.series_id, '') AS sku, COALESCE(MAX(se.name), 'No series') AS name,
			        COALESCE(MAX(se.publisher), '') AS publisher, ${bucket} AS country, COALESCE(SUM(${col}),0) AS val
			 FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id
			 LEFT JOIN series se ON se.id = li.series_id
			 WHERE ${clause} AND li.close_date >= ? AND li.close_date < ?
			 GROUP BY COALESCE(li.series_id, ''), country`
		).bind(...binds, cur.start, cur.end).all()).results ?? []
		: (await salesDb.prepare(
			`SELECT li.sku AS sku, COALESCE(${CAT_NAME}, MAX(li.name)) AS name, ${bucket} AS country,
			        COALESCE(SUM(${col}),0) AS val
			 FROM deal_line_items li JOIN sales_deals d ON d.deal_id = li.deal_id
			 WHERE ${clause} AND li.close_date >= ? AND li.close_date < ? AND li.sku IS NOT NULL AND li.sku != ''
			 GROUP BY li.sku, country`
		).bind(...binds, cur.start, cur.end).all()).results ?? [];

	const bySku = new Map();
	const countryTotal = new Map();
	for (const r of rows) {
		const val = Math.round(r.val || 0);
		if (!val && val !== 0) continue;
		if (!bySku.has(r.sku)) bySku.set(r.sku, { sku: r.sku, name: r.name || r.sku, publisher: r.publisher ?? null, values: new Map(), total: 0 });
		const row = bySku.get(r.sku);
		row.values.set(r.country, (row.values.get(r.country) || 0) + val);
		row.total += val;
		countryTotal.set(r.country, (countryTotal.get(r.country) || 0) + val);
	}

	// Column order: DK, SE, NO first, then remaining countries by total desc.
	const LEAD = ['Denmark', 'Sweden', 'Norway'];
	const rest = [...countryTotal.keys()]
		.filter((c) => !LEAD.includes(c))
		.sort((a, b) => (countryTotal.get(b) - countryTotal.get(a)) || a.localeCompare(b));
	const countries = [...LEAD.filter((c) => countryTotal.has(c)), ...rest];
	const outRows = [...bySku.values()].sort((a, b) =>
		(by === 'series' ? (a.sku === '') - (b.sku === '') : 0) // "No series" last
		|| b.total - a.total || (a.name || '').localeCompare(b.name || ''));
	return { measure: m, by: by === 'series' ? 'series' : 'product', countries, rows: outRows, period: { start: cur.start, end: cur.end } };
}

const csvCell = (v) => {
	const s = v == null ? '' : String(v);
	return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Render an export (from computeExport) to semicolon-delimited CSV with a BOM,
 * so it opens with correct columns and æøå in Nordic Excel. */
export function exportToCsv(exp) {
	const series = exp.by === 'series';
	const header = [series ? 'Series' : 'Product', series ? 'Publisher' : 'SKU', ...exp.countries.map((c) => CC[c] ?? c), 'Total'];
	const lines = [header.map(csvCell).join(';')];
	for (const r of exp.rows) {
		const cells = [
			r.name || r.sku, series ? (r.publisher ?? '') : r.sku,
			...exp.countries.map((c) => { const v = r.values.get(c) || 0; return v ? v : ''; }),
			r.total,
		];
		lines.push(cells.map(csvCell).join(';'));
	}
	return '﻿' + lines.join('\r\n') + '\r\n';
}

/** Build a CSV download Response with a safe, unicode-friendly filename. */
export function csvResponse(csv, filename) {
	const ascii = filename.replace(/[^\w.\- ]+/g, '_');
	return new Response(csv, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
			'Cache-Control': 'no-store',
		},
	});
}
