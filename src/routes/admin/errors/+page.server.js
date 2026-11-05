import { error } from '@sveltejs/kit';
import { rawDb } from '$lib/server/errorLog.js';

/** @type {Record<string, string>} */
const RANGES = { '24h': '-1 day', '7d': '-7 days', '30d': '-30 days' };

// Admin → Error Log: errors grouped by fingerprint, newest first.
export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = rawDb(platform?.env?.DB);
	if (!db) error(500, 'Database unavailable');

	const r = url.searchParams.get('range') ?? '';
	const range = RANGES[r] ? r : '7d';
	const source = ['server', 'client', 'retry'].includes(url.searchParams.get('source') ?? '') ? url.searchParams.get('source') : '';
	const showResolved = url.searchParams.get('resolved') === '1';
	const ref = (url.searchParams.get('ref') ?? '').trim();

	try {
		const where = [`at >= datetime('now', ?)`];
		const binds = [RANGES[range]];
		if (source) { where.push('source = ?'); binds.push(source); }
		if (!showResolved) where.push('resolved = 0');
		if (ref) { where.length = 0; binds.length = 0; where.push('fingerprint = (SELECT fingerprint FROM error_log WHERE ref = ? LIMIT 1)'); binds.push(ref); }
		const groups = (await db.prepare(
			`SELECT fingerprint, COUNT(*) AS n, MIN(at) AS first_at, MAX(at) AS last_at,
			        COUNT(DISTINCT user_email) AS users, MAX(id) AS last_id,
			        MAX(source) AS source, MAX(route) AS route, MIN(resolved) AS open
			 FROM error_log WHERE ${where.join(' AND ')}
			 GROUP BY fingerprint ORDER BY last_at DESC LIMIT 200`
		).bind(...binds).all()).results ?? [];
		// Latest occurrence per group (message, path, status, stack, user).
		const ids = groups.map((g) => g.last_id);
		const latest = new Map();
		for (let i = 0; i < ids.length; i += 90) {
			const part = ids.slice(i, i + 90);
			const rows = (await db.prepare(`SELECT * FROM error_log WHERE id IN (${part.map(() => '?').join(',')})`).bind(...part).all()).results ?? [];
			for (const r of rows) latest.set(r.id, r);
		}
		const totals = (await db.prepare(
			`SELECT source, COUNT(*) AS n FROM error_log WHERE at >= datetime('now', '-1 day') GROUP BY source`
		).all()).results ?? [];
		return {
			user, ready: true, range, source, showResolved, ref,
			groups: groups.map((g) => ({ ...g, latest: latest.get(g.last_id) ?? null })),
			last24: /** @type {Record<string, number>} */ (Object.fromEntries(totals.map((t) => [t.source, t.n]))),
		};
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { user, ready: false, noTable: /no such table/i.test(message), message, groups: [], range, source, showResolved, ref, last24: /** @type {Record<string, number>} */ ({}) };
	}
}
