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

		const customers = (await db.prepare(
			`SELECT customer_group_name AS name, sub_site AS site,
			        COUNT(*) AS orders, COALESCE(SUM(line_count),0) AS lines, COALESCE(SUM(unit_count),0) AS units
			 FROM wms_orders
			 WHERE done_date IS NOT NULL AND done_date BETWEEN ? AND ? AND customer_group_name IS NOT NULL
			 GROUP BY customer_group_name
			 ORDER BY units DESC LIMIT 15`
		).bind(from, to).all()).results ?? [];

		const meta = await db.prepare('SELECT last_run, last_done_max, orders_seen, status FROM wms_sync_meta WHERE id = 1').first().catch(() => null);

		return { from, to, presets, selected, ready: true, inbound, handled, customers, syncMeta: meta };
	} catch (e) {
		return { from, to, presets, selected, ready: false, reason: 'no-table', message: e instanceof Error ? e.message : String(e) };
	}
}
