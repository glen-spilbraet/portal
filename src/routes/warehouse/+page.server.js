// Warehouse dashboard (under Stats) — Inbound (orders received) vs Handled
// (orders done) over a date range, from the wms_orders mirror (populated by the
// lagersystem-sync worker). Access is enforced by the root layout (`warehouse`
// permission); route lives at /warehouse.

const ymd = (d) => d.toISOString().slice(0, 10);

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

	const db = platform?.env?.DB;
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

		// Per-customer inbound (received) + handled (done).
		const cIn = await rows(
			`SELECT customer_group_name AS name, COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders WHERE customer_group_name IS NOT NULL AND received_date IS NOT NULL
			 AND substr(received_date,1,10) BETWEEN ? AND ? GROUP BY customer_group_name`);
		const cHd = await rows(
			`SELECT customer_group_name AS name, COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders WHERE customer_group_name IS NOT NULL AND done_date IS NOT NULL
			 AND done_date BETWEEN ? AND ? GROUP BY customer_group_name`);

		// Per-product (SKU) inbound + handled, via the order lines.
		const pIn = await rows(
			`SELECT l.item_number AS name, MAX(l.title) AS label, COUNT(DISTINCT l.order_id) AS orders,
			        COUNT(*) AS lines, COALESCE(SUM(l.amount_delivered),0) AS units
			 FROM wms_order_lines l JOIN wms_orders ord ON ord.order_id = l.order_id
			 WHERE l.item_number IS NOT NULL AND ord.received_date IS NOT NULL
			 AND substr(ord.received_date,1,10) BETWEEN ? AND ? GROUP BY l.item_number`);
		const pHd = await rows(
			`SELECT l.item_number AS name, MAX(l.title) AS label, COUNT(DISTINCT l.order_id) AS orders,
			        COUNT(*) AS lines, COALESCE(SUM(l.amount_delivered),0) AS units
			 FROM wms_order_lines l JOIN wms_orders ord ON ord.order_id = l.order_id
			 WHERE l.item_number IS NOT NULL AND ord.done_date IS NOT NULL
			 AND ord.done_date BETWEEN ? AND ? GROUP BY l.item_number`);

		const merge = (inRows, hdRows) => {
			const m = new Map();
			const touch = (name, label) => {
				let e = m.get(name);
				if (!e) { e = { name, label: label || name, in_orders: 0, in_lines: 0, in_units: 0, hd_orders: 0, hd_lines: 0, hd_units: 0 }; m.set(name, e); }
				else if (label && e.label === e.name) e.label = label;
				return e;
			};
			for (const r of inRows) { const e = touch(r.name, r.label); e.in_orders = r.orders; e.in_lines = r.lines; e.in_units = r.units; }
			for (const r of hdRows) { const e = touch(r.name, r.label); e.hd_orders = r.orders; e.hd_lines = r.lines; e.hd_units = r.units; }
			return [...m.values()];
		};

		const customers = merge(cIn, cHd);
		const products = merge(pIn, pHd)
			.sort((a, b) => (b.in_units + b.hd_units) - (a.in_units + a.hd_units))
			.slice(0, 200);

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

		return { from, to, presets, selected, ready: true, inbound, handled, dims: { customers, products }, handling, syncMeta: meta };
	} catch (e) {
		return { from, to, presets, selected, ready: false, reason: 'no-table', message: e instanceof Error ? e.message : String(e) };
	}
}
