// Warehouse dashboard (under Stats) — Inbound (orders received) vs Handled
// (orders done) over a date range, from the wms_orders mirror (populated by the
// lagersystem-sync worker). Access is enforced by the root layout (`warehouse`
// permission); route lives at /warehouse.

function ymdDaysAgo(n) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - n);
	return d.toISOString().slice(0, 10);
}

export async function load({ url, platform }) {
	const today = new Date().toISOString().slice(0, 10);
	const from = url.searchParams.get('from') || ymdDaysAgo(29);
	const to = url.searchParams.get('to') || today;

	const db = platform?.env?.DB;
	if (!db) return { from, to, ready: false, reason: 'no-db' };

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

		return { from, to, ready: true, inbound, handled, customers, meta };
	} catch (e) {
		// Tables not created yet (migration 0099 not applied), etc.
		return { from, to, ready: false, reason: 'no-table', message: e instanceof Error ? e.message : String(e) };
	}
}
