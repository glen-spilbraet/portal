/**
 * Daily result cache for custom reports.
 *
 * Sales data only changes when the nightly HubSpot sync runs, so a report's
 * result is reusable until either its criteria change (→ new cache key) or a
 * new sync completes (→ new stamp). Rows live in the app DB (`report_cache`,
 * migration 0104); the stamp is read from SALES_DB's single-row sync meta.
 *
 * Fails open: any cache problem (missing table, bad JSON) just computes live.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

async function sha256(text) {
	const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Current data version, or null while a sync is running (don't cache then). @param {D1} salesDb */
async function dataStamp(salesDb) {
	const m = await salesDb.prepare('SELECT last_run, status FROM sales_sync_meta WHERE id = 1').first().catch(() => null);
	if (!m?.last_run || m.status === 'running') return null;
	return String(m.last_run);
}

/**
 * Return the cached value for `criteria`, or compute it with `fn()` and store it.
 * `criteria` must contain everything that affects the result (rules, metric,
 * window…). Today's UTC date is always mixed in, because default windows
 * (year-to-date, current-year chart) move with the calendar.
 * @param {D1 | undefined} appDb  @param {D1} salesDb
 * @template T @param {() => Promise<T>} fn @returns {Promise<T>}
 */
export async function cachedReport(appDb, salesDb, criteria, fn) {
	if (!appDb) return fn();
	let key, stamp;
	try {
		const day = new Date().toISOString().slice(0, 10);
		key = await sha256(JSON.stringify({ v: 1, day, ...criteria }));
		stamp = await dataStamp(salesDb);
		if (stamp) {
			const row = await appDb.prepare('SELECT payload FROM report_cache WHERE key = ? AND stamp = ?').bind(key, stamp).first();
			if (row?.payload) return JSON.parse(String(row.payload));
		}
	} catch { stamp = null; /* table missing etc. → compute live */ }

	const value = await fn();
	if (stamp && key) {
		try {
			await appDb.batch([
				appDb.prepare(
					`INSERT INTO report_cache (key, stamp, payload, created_at) VALUES (?, ?, ?, datetime('now'))
					 ON CONFLICT(key) DO UPDATE SET stamp = excluded.stamp, payload = excluded.payload, created_at = excluded.created_at`
				).bind(key, stamp, JSON.stringify(value)),
				// Housekeeping: anything older than two days can never be hit again.
				appDb.prepare(`DELETE FROM report_cache WHERE created_at < datetime('now', '-2 days')`),
			]);
		} catch { /* best effort */ }
	}
	return value;
}

/** Stable criteria for a rule list (order-preserving, only the fields that matter). */
export const ruleKey = (rules) => (rules ?? []).map((r) => [r.action, r.kind, String(r.value ?? '').trim()]);
