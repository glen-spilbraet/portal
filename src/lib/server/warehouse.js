// Warehouse dashboard data (Stats → Warehouse, route /warehouse).
// Inbound (orders received) vs Handled (orders done) over a date range, from
// the wms_* mirror in SALES_DB (always the prod portal-db), populated NIGHTLY
// by the lagersystem-sync worker. Results are cached per range until the next
// sync, and the worker warms the cache right after it finishes
// (/api/warehouse/warm), so daytime page loads are a single cache read.

import { cachedReport } from '$lib/server/reportCache.js';

const ymd = (d) => d.toISOString().slice(0, 10);

// Warehouse data only changes when the lagersystem-sync worker runs (nightly
// orders + stock snapshot), so results are cached until a run stamps a new
// last_run. Not cached while a sync is mid-run.
async function wmsStamp(db) {
	const r = (await db.prepare('SELECT id, last_run, status FROM wms_sync_meta WHERE id IN (1, 2)').all()).results ?? [];
	if (!r.length || r.some((x) => x.status === 'running')) return null;
	return r.map((x) => `${x.id}:${x.last_run}`).join('|');
}

// Lagersystem stores the delivery country as an ISO 3166 numeric code.
const COUNTRY_BY_NUM = {
	'208': 'Denmark', '752': 'Sweden', '578': 'Norway', '246': 'Finland', '352': 'Iceland',
	'234': 'Faroe Islands', '304': 'Greenland', '276': 'Germany', '826': 'United Kingdom',
	'528': 'Netherlands', '056': 'Belgium', '250': 'France', '040': 'Austria', '756': 'Switzerland',
	'380': 'Italy', '724': 'Spain', '620': 'Portugal', '372': 'Ireland', '616': 'Poland',
	'203': 'Czech Republic', '233': 'Estonia', '428': 'Latvia', '440': 'Lithuania',
	'442': 'Luxembourg', '840': 'United States', '124': 'Canada', '036': 'Australia',
};
function countryName(code) {
	if (code == null || code === '') return 'Unknown';
	const c = String(code).padStart(3, '0');
	return COUNTRY_BY_NUM[c] ?? `Country ${code}`;
}

/**
 * Quick-select presets. All of them END YESTERDAY — today is never included
 * (the data is synced nightly, so today would always be partial/empty).
 * "To date" periods run from the start of the period containing yesterday,
 * so on the 1st, "Month to date" is the whole previous month.
 */
export function buildPresets() {
	const now = new Date();
	const utc = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd));
	const end = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1); // yesterday
	const y = end.getUTCFullYear();
	const m = end.getUTCMonth();
	const minus = (n) => { const d = new Date(end); d.setUTCDate(d.getUTCDate() - n); return d; };

	const q = Math.floor(m / 3);
	const qStart = utc(y, q * 3, 1);
	const lqStart = utc(y, q * 3 - 3, 1);              // Date.UTC rolls negative months back a year
	const lqEnd = utc(y, q * 3, 0);                    // day 0 = last day of the previous month
	const lmStart = utc(y, m - 1, 1);
	const lmEnd = utc(y, m, 0);

	return [
		{ key: 'mtd', label: 'Month to date',   from: ymd(utc(y, m, 1)), to: ymd(end) },
		{ key: 'qtd', label: 'Quarter to date', from: ymd(qStart),       to: ymd(end) },
		{ key: 'ytd', label: 'Year to date',    from: ymd(utc(y, 0, 1)), to: ymd(end) },
		{ key: '7d',  label: 'Last 7 days',     from: ymd(minus(6)),     to: ymd(end) },
		{ key: '30d', label: 'Last 30 days',    from: ymd(minus(29)),    to: ymd(end) },
		{ key: 'lm',  label: 'Last month',      from: ymd(lmStart),      to: ymd(lmEnd) },
		{ key: 'lq',  label: 'Last quarter',    from: ymd(lqStart),      to: ymd(lqEnd) },
		{ key: 'ly',  label: 'Last year',       from: ymd(utc(y - 1, 0, 1)), to: ymd(utc(y - 1, 11, 31)) },
	];
}

/**
 * Operational tab data for a range — cached until the next nightly sync.
 * Throws on DB errors (caller shows the error state).
 */
export async function loadOperational(env, from, to) {
	const db = env.SALES_DB, appDb = env.DB;
	return cachedReport(appDb, db, { kind: 'warehouse', v: 2, from, to },
		() => computeRange(db, appDb, from, to), { stamp: wmsStamp });
}

/** Pre-build the cache for every preset (called by the worker after its nightly run). */
export async function warmWarehouse(env) {
	const out = [];
	for (const p of buildPresets()) {
		const t = Date.now();
		try { await loadOperational(env, p.from, p.to); out.push({ key: p.key, ms: Date.now() - t }); }
		catch (e) { out.push({ key: p.key, error: e instanceof Error ? e.message : String(e) }); }
		await new Promise((r) => setTimeout(r, 300)); // be gentle with the shared DB
	}
	return out;
}

async function computeRange(db, appDb, from, to) {
	{
		const inbound = (await db.prepare(
			`SELECT substr(received_date,1,10) AS d, sub_site AS site,
			        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders
			 WHERE received_date IS NOT NULL AND received_date >= ? AND received_date < date(?, '+1 day')
			 GROUP BY d, site`
		).bind(from, to).all()).results ?? [];

		const handled = (await db.prepare(
			`SELECT done_date AS d, sub_site AS site,
			        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders
			 WHERE done_date IS NOT NULL AND done_date BETWEEN ? AND ?
			 GROUP BY d, site`
		).bind(from, to).all()).results ?? [];

		const rows = async (sql) => (await db.prepare(sql).bind(from, to).all()).results ?? [];

		// Breakdown dimensions — handled orders only (done_date in range).
		// Product name: canonical sheet name (sales_sheets + translations, primary
		// language first) — same rule as the other reports — falling back to the
		// Lagersystem line title only when the SKU has no sheet.
		const names = await catalogNames(appDb);
		const products = (await rows(
			`SELECT l.item_number AS key, MAX(l.title) AS label, COUNT(DISTINCT l.order_id) AS orders,
			        COUNT(*) AS lines, COALESCE(SUM(l.amount_delivered),0) AS units
			 FROM wms_order_lines l JOIN wms_orders ord ON ord.order_id = l.order_id
			 WHERE l.item_number IS NOT NULL AND ord.done_date IS NOT NULL AND ord.done_date BETWEEN ? AND ?
			 GROUP BY l.item_number ORDER BY units DESC LIMIT 500`
		)).map((r) => ({ ...r, label: names.get(String(r.key).toLowerCase()) ?? r.label }));
		const customers = await rows(
			`SELECT customer_group_name AS key, customer_group_name AS label, COUNT(*) AS orders,
			        COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders WHERE customer_group_name IS NOT NULL AND done_date IS NOT NULL AND done_date BETWEEN ? AND ?
			 GROUP BY customer_group_name`);
		const countries = (await rows(
			`SELECT country AS key, COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders WHERE done_date IS NOT NULL AND done_date BETWEEN ? AND ?
			 GROUP BY country`)).map((r) => ({ ...r, label: countryName(r.key) }));

		const meta = await db.prepare('SELECT last_run, last_done_max, orders_seen, status FROM wms_sync_meta WHERE id = 1').first().catch(() => null);
		const trackingStart = (await db.prepare('SELECT MIN(done_date) AS d FROM wms_orders').first().catch(() => null))?.d ?? null;

		// Estimated handling time: whole-day gap received → done over the last 7
		// days of handled orders, EXCLUDING Date Orders (those with a delivery_date).
		// done_date is date-only, so resolution is days. Separate try so a missing
		// delivery_date column (migration 0101 not applied) doesn't blank the page.
		let handling = null;
		try {
			const ht = (await db.prepare(
				`SELECT CAST(julianday(done_date) - julianday(date(received_date)) AS REAL) AS days
				 FROM wms_orders
				 WHERE done_date IS NOT NULL AND received_date IS NOT NULL AND delivery_date IS NULL
				   AND done_date >= date('now','-7 day')`
			).all()).results ?? [];
			const diffs = ht.map((r) => Number(r.days)).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
			if (diffs.length) {
				const median = diffs.length % 2 ? diffs[(diffs.length - 1) / 2] : (diffs[diffs.length / 2 - 1] + diffs[diffs.length / 2]) / 2;
				const avg = diffs.reduce((s, d) => s + d, 0) / diffs.length;
				handling = { median, avg, n: diffs.length };
			} else {
				handling = { median: null, avg: null, n: 0 };
			}
		} catch { handling = null; }

		// Each block below has its own guard so one missing table/column (e.g.
		// migration 0102 not applied yet) hides just that section.
		const heatmap = await loadHeatmap(db, from, to).catch(() => null);
		const scorecard = await loadScorecard(db, to, trackingStart).catch(() => null);

		return { inbound, handled, dims: { products, customers, countries }, handling, heatmap, scorecard, syncMeta: meta, trackingStart };
	}
}

// ── Order arrivals heatmap (weekday × hour of receipt) ──────────────────────
async function loadHeatmap(db, from, to) {
	const rows = (await db.prepare(
		`SELECT CAST(strftime('%w', received_date) AS INTEGER) AS wd, CAST(strftime('%H', received_date) AS INTEGER) AS hr,
		        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
		 FROM wms_orders
		 WHERE received_date IS NOT NULL AND received_date >= ? AND received_date < date(?, '+1 day')
		 GROUP BY wd, hr`
	).bind(from, to).all()).results ?? [];
	// How many of each weekday the range spans, so cells can show a per-day average.
	const dayCount = [0, 0, 0, 0, 0, 0, 0];
	const d = new Date(from + 'T00:00:00Z');
	const end = new Date(to + 'T00:00:00Z');
	for (let guard = 0; d <= end && guard < 5000; guard++) { dayCount[d.getUTCDay()]++; d.setUTCDate(d.getUTCDate() + 1); }
	return { rows, dayCount };
}

// ── Weekly scorecard ─────────────────────────────────────────────────────────
const addDays = (ymdStr, n) => { const x = new Date(ymdStr + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
function isoWeek(ymdStr) {
	const d = new Date(ymdStr + 'T00:00:00Z');
	d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
	const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
	return 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
}
// Monday of the week containing a YYYY-MM-DD column value.
const WK = (col) => `date(${col}, '-' || ((CAST(strftime('%w', ${col}) AS INTEGER) + 6) % 7) || ' days')`;

async function scoreSpan(db, start, end, weekEnds) {
	const recv = (await db.prepare(
		`SELECT ${WK('substr(received_date,1,10)')} AS w, COUNT(*) AS c FROM wms_orders
		 WHERE received_date IS NOT NULL AND received_date >= ? AND received_date < date(?, '+1 day') GROUP BY w`
	).bind(start, end).all()).results ?? [];
	const hand = (await db.prepare(
		`SELECT ${WK('done_date')} AS w, COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
		 FROM wms_orders WHERE done_date BETWEEN ? AND ? GROUP BY w`
	).bind(start, end).all()).results ?? [];
	// Handling-time histogram (whole days), excluding Date Orders.
	const hist = (await db.prepare(
		`SELECT ${WK('done_date')} AS w, CAST(julianday(done_date) - julianday(date(received_date)) AS INTEGER) AS d, COUNT(*) AS c
		 FROM wms_orders WHERE done_date BETWEEN ? AND ? AND received_date IS NOT NULL AND delivery_date IS NULL
		 GROUP BY w, d`
	).bind(start, end).all()).results ?? [];
	// Open orders at each week end (received by then, not yet handled or gone).
	// One read of only the orders that could be open in the span — everything
	// handled/gone before the first week end is skipped — then counted in JS.
	// (Was one near-full-table subquery per week end: ~130k rows per span.)
	const sortedEnds = [...weekEnds].sort();
	const minE = sortedEnds[0], maxE = sortedEnds[sortedEnds.length - 1];
	const openRows = (await db.prepare(
		`SELECT substr(received_date,1,10) AS r, done_date AS d, gone_date AS g FROM wms_orders
		 WHERE received_date IS NOT NULL AND received_date < date(?, '+1 day')
		   AND (done_date IS NULL OR done_date > ?) AND (gone_date IS NULL OR gone_date > ?)`
	).bind(maxE, minE, minE).all()).results ?? [];
	const backlog = weekEnds.map((e) => ({
		e,
		open: openRows.reduce((n, o) => n + (o.r <= e && (!o.d || o.d > e) && (!o.g || o.g > e) ? 1 : 0), 0),
	}));

	const by = (rows, k = 'w') => new Map(rows.map((r) => [r[k], r]));
	const recvM = by(recv), handM = by(hand), backM = by(backlog, 'e');
	const histM = new Map();
	for (const r of hist) {
		if (r.d == null || r.d < 0) continue;
		(histM.get(r.w) ?? histM.set(r.w, []).get(r.w)).push([Number(r.d), Number(r.c)]);
	}
	return { recvM, handM, backM, histM };
}

function weekStats(span, monday) {
	const sunday = addDays(monday, 6);
	const h = span.handM.get(monday);
	const hist = (span.histM.get(monday) ?? []).sort((a, b) => a[0] - b[0]);
	const n = hist.reduce((s, [, c]) => s + c, 0);
	let median = null, within1 = null;
	if (n) {
		let cum = 0;
		for (const [d, c] of hist) { cum += c; if (cum >= n / 2) { median = d; break; } }
		within1 = (hist.filter(([d]) => d <= 1).reduce((s, [, c]) => s + c, 0) / n) * 100;
	}
	const b = span.backM.get(sunday);
	return {
		monday, sunday, week: isoWeek(monday),
		received: span.recvM.get(monday)?.c ?? 0,
		handled: h?.orders ?? 0,
		units: h?.units ?? 0,
		lines: h?.lines ?? 0,
		median, within1,
		backlog: b ? b.open : null,
	};
}

async function loadScorecard(db, to, first) {
	// Anchor on the last COMPLETE Mon–Sun week on/before `to` (and before today).
	const today = ymd(new Date());
	let anchor = to < today ? to : addDays(today, -1);
	const dow = new Date(anchor + 'T00:00:00Z').getUTCDay(); // 0 = Sunday
	const lastSunday = dow === 0 ? anchor : addDays(anchor, -dow);
	const N = 8;
	const mondays = Array.from({ length: N }, (_, i) => addDays(lastSunday, -6 - 7 * (N - 1 - i)));
	const lyMondays = mondays.map((m) => addDays(m, -364)); // same ISO week, previous year

	const cur = await scoreSpan(db, mondays[0], lastSunday, mondays.map((m) => addDays(m, 6)));
	const ly = await scoreSpan(db, lyMondays[0], addDays(lyMondays[N - 1], 6), lyMondays.map((m) => addDays(m, 6)));
	return {
		weeks: mondays.map((m) => weekStats(cur, m)),
		lyWeeks: lyMondays.map((m) => ({ ...weekStats(ly, m), covered: !!first && m >= first })),
		trackingStart: first,
	};
}

// ── Slow movers / dead stock ─────────────────────────────────────────────────
// Reads ONLY the nightly wms_sku_activity summary (worker-computed), never the
// order history. Returns SKUs in stock that either had no sale in the last 90
// days or sold less than their stock over the last 12 months (> 12 mo cover);
// the tab filters further (90/180/365 / slow movers) client-side.
export async function loadDeadStock(db, appDb) {
	const rows = (await db.prepare(
		`SELECT item_number AS sku, title, category, vendor, stock, last_sale, units_90, units_180, units_365, computed_at
		 FROM wms_sku_activity
		 WHERE stock > 0 AND (last_sale IS NULL OR last_sale < date('now','-90 day') OR units_365 < stock)
		 ORDER BY stock DESC`
	).all()).results ?? [];
	const names = await catalogNames(appDb);
	for (const r of rows) r.name = names.get(String(r.sku).toLowerCase()) ?? r.title;
	const meta = await db.prepare(`SELECT last_run, orders_seen FROM wms_sync_meta WHERE id = 3`).first().catch(() => null);
	const first = (await db.prepare(`SELECT MIN(done_date) AS d FROM wms_orders`).first().catch(() => null))?.d ?? null;
	return { rows, computed: meta?.last_run ?? rows[0]?.computed_at ?? null, products: meta?.orders_seen ?? null, trackingStart: first };
}

// ── Product names from Sheets (app DB) ──────────────────────────────────────
// lower(sku) → product_name, preferring the sheet's primary language. Read once
// per page load; an empty map (e.g. DB unavailable) just falls back to the
// Lagersystem title.
async function catalogNames(appDb) {
	const m = new Map();
	if (!appDb) return m;
	try {
		const rows = (await appDb.prepare(
			`SELECT lower(s.sku) AS sku, tr.value AS name
			 FROM sales_sheets s JOIN translations tr ON tr.sheet_id = s.id
			 WHERE tr.key = 'product_name' AND COALESCE(tr.value,'') != '' AND COALESCE(s.sku,'') != ''
			 ORDER BY (tr.language = s.primary_language) ASC`
		).all()).results ?? [];
		for (const r of rows) m.set(r.sku, r.name); // primary language sorts last → wins
	} catch { /* fall back to Lagersystem titles */ }
	return m;
}
