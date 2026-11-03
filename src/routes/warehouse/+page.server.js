// Warehouse dashboard (under Stats) — Inbound (orders received) vs Handled
// (orders done) over a date range, from the wms_orders mirror (populated by the
// lagersystem-sync worker). Access is enforced by the root layout (`warehouse`
// permission); route lives at /warehouse.

const ymd = (d) => d.toISOString().slice(0, 10);

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

/** Quick-select presets (independent of the Stats date picker). */
function buildPresets() {
	const now = new Date();
	const y = now.getUTCFullYear();
	const m = now.getUTCMonth();
	const today = new Date(Date.UTC(y, m, now.getUTCDate()));
	const minus = (n) => { const d = new Date(today); d.setUTCDate(d.getUTCDate() - n); return d; };
	const utc = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd));

	const q = Math.floor(m / 3);
	const qStart = utc(y, q * 3, 1);
	const lqStartMonthRaw = q * 3 - 3;
	const lqYear = lqStartMonthRaw < 0 ? y - 1 : y;
	const lqStart = utc(lqYear, (lqStartMonthRaw + 12) % 12, 1);
	const lqEnd = new Date(qStart); lqEnd.setUTCDate(lqEnd.getUTCDate() - 1);

	return [
		{ key: '7d',  label: 'Last 7 days',   from: ymd(minus(6)),  to: ymd(today) },
		{ key: '14d', label: 'Last 14 days',  from: ymd(minus(13)), to: ymd(today) },
		{ key: '30d', label: 'Last 30 days',  from: ymd(minus(29)), to: ymd(today) },
		{ key: 'tq',  label: 'This quarter',  from: ymd(qStart),    to: ymd(today) },
		{ key: 'lq',  label: 'Last quarter',  from: ymd(lqStart),   to: ymd(lqEnd) },
		{ key: 'ty',  label: 'This year',     from: ymd(utc(y, 0, 1)),   to: ymd(today) },
		{ key: 'ly',  label: 'Last year',     from: ymd(utc(y - 1, 0, 1)), to: ymd(utc(y - 1, 11, 31)) },
	];
}

export async function load({ url, platform }) {
	const presets = buildPresets();
	const def = presets.find((p) => p.key === '30d');
	const from = url.searchParams.get('from') || def.from;
	const to = url.searchParams.get('to') || def.to;
	const selected = presets.find((p) => p.from === from && p.to === to)?.key ?? 'custom';

	// Warehouse data lives in SALES_DB — always the prod portal-db, shared by
	// every environment (like the sales stats): one sync, one copy. Sheets
	// (product names) are app data in DB, so names are looked up there and
	// merged in JS — D1 can't join across databases.
	const db = platform?.env?.SALES_DB;
	const appDb = platform?.env?.DB;
	if (!db) return { from, to, presets, selected, ready: false, reason: 'no-db' };

	try {
		const inbound = (await db.prepare(
			`SELECT substr(received_date,1,10) AS d, sub_site AS site,
			        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders
			 WHERE received_date IS NOT NULL AND substr(received_date,1,10) BETWEEN ? AND ?
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
		const scorecard = await loadScorecard(db, to).catch(() => null);
		const deadStock = await loadDeadStock(db, names).catch(() => null);

		return {
			from, to, presets, selected, ready: true, inbound, handled,
			dims: { products, customers, countries }, handling, heatmap, scorecard, deadStock, syncMeta: meta,
		};
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { from, to, presets, selected, ready: false, reason: /no such table/i.test(message) ? 'no-table' : 'error', message };
	}
}

// ── Order arrivals heatmap (weekday × hour of receipt) ──────────────────────
async function loadHeatmap(db, from, to) {
	const rows = (await db.prepare(
		`SELECT CAST(strftime('%w', received_date) AS INTEGER) AS wd, CAST(strftime('%H', received_date) AS INTEGER) AS hr,
		        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
		 FROM wms_orders
		 WHERE received_date IS NOT NULL AND substr(received_date,1,10) BETWEEN ? AND ?
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
		 WHERE received_date IS NOT NULL AND substr(received_date,1,10) BETWEEN ? AND ? GROUP BY w`
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
	const fill = (await db.prepare(
		`SELECT ${WK('o.done_date')} AS w, COALESCE(SUM(l.amount_delivered),0) AS dl, COALESCE(SUM(l.amount),0) AS am
		 FROM wms_order_lines l JOIN wms_orders o ON o.order_id = l.order_id
		 WHERE o.done_date BETWEEN ? AND ? GROUP BY w`
	).bind(start, end).all()).results ?? [];
	// Open orders at each week end (received by then, not yet handled or gone).
	const ph = weekEnds.map(() => '(?)').join(',');
	const backlog = (await db.prepare(
		`WITH ends(e) AS (VALUES ${ph})
		 SELECT e, (SELECT COUNT(*) FROM wms_orders o
		            WHERE o.received_date IS NOT NULL AND substr(o.received_date,1,10) <= e
		              AND (o.done_date IS NULL OR o.done_date > e)
		              AND (o.gone_date IS NULL OR o.gone_date > e)) AS open
		 FROM ends`
	).bind(...weekEnds).all()).results ?? [];

	const by = (rows, k = 'w') => new Map(rows.map((r) => [r[k], r]));
	const recvM = by(recv), handM = by(hand), fillM = by(fill), backM = by(backlog, 'e');
	const histM = new Map();
	for (const r of hist) {
		if (r.d == null || r.d < 0) continue;
		(histM.get(r.w) ?? histM.set(r.w, []).get(r.w)).push([Number(r.d), Number(r.c)]);
	}
	return { recvM, handM, fillM, backM, histM };
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
	const f = span.fillM.get(monday);
	const b = span.backM.get(sunday);
	return {
		monday, sunday, week: isoWeek(monday),
		received: span.recvM.get(monday)?.c ?? 0,
		handled: h?.orders ?? 0,
		units: h?.units ?? 0,
		lines: h?.lines ?? 0,
		median, within1,
		fill: f && f.am > 0 ? (f.dl / f.am) * 100 : null,
		backlog: b ? b.open : null,
	};
}

async function loadScorecard(db, to) {
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
	const first = (await db.prepare(`SELECT MIN(done_date) AS d FROM wms_orders`).first())?.d ?? null;

	return {
		weeks: mondays.map((m) => weekStats(cur, m)),
		lyWeeks: lyMondays.map((m) => ({ ...weekStats(ly, m), covered: !!first && m >= first })),
		trackingStart: first,
	};
}

// ── Slow & dead stock ────────────────────────────────────────────────────────
// SKUs with stock that haven't shipped in ≥ 60 days (or ever since tracking
// began), or that would take > 12 months to sell at the last-90-day pace.
async function loadDeadStock(db, names) {
	const rows = (await db.prepare(
		`SELECT s.item_number AS sku, s.title, s.category, s.vendor, s.stock, s.colli_size,
		          ls.last_done, COALESCE(u.units, 0) AS units90
		   FROM wms_stock s
		   LEFT JOIN (SELECT l.item_number, MAX(o.done_date) AS last_done
		              FROM wms_order_lines l JOIN wms_orders o ON o.order_id = l.order_id
		              WHERE o.done_date IS NOT NULL GROUP BY l.item_number) ls ON ls.item_number = s.item_number
		   LEFT JOIN (SELECT l.item_number, SUM(l.amount_delivered) AS units
		              FROM wms_order_lines l JOIN wms_orders o ON o.order_id = l.order_id
		              WHERE o.done_date >= date('now','-90 day') GROUP BY l.item_number) u ON u.item_number = s.item_number
		   WHERE s.stock > 0
		     AND (ls.last_done IS NULL OR ls.last_done < date('now','-60 day') OR COALESCE(u.units,0) * 365.0 / 90 < s.stock)
		   ORDER BY s.stock DESC LIMIT 3000`
	).all()).results ?? [];
	for (const r of rows) r.name = names.get(String(r.sku).toLowerCase()) ?? r.title;
	const meta = await db.prepare(`SELECT COUNT(*) AS n FROM wms_stock`).first();
	// Snapshot time is kept in wms_sync_meta row id = 2 by the worker (ISO string).
	const snap = await db.prepare(`SELECT last_run FROM wms_sync_meta WHERE id = 2`).first().catch(() => null);
	const first = (await db.prepare(`SELECT MIN(done_date) AS d FROM wms_orders`).first())?.d ?? null;
	return { rows, updated: snap?.last_run ?? null, products: meta?.n ?? 0, trackingStart: first };
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
