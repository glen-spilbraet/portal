import { error } from '@sveltejs/kit';
import { rawDb } from '$lib/server/errorLog.js';
import { readSettings, normSql, DEFAULT_THRESHOLD_MS } from '$lib/server/perfLog.js';

const RANGES = { '24h': 86400_000, '7d': 7 * 86400_000, '14d': 14 * 86400_000 };

// Admin → Performance: slow requests logged while the performance log is on.
export async function load({ parent, platform, url }) {
	const { user } = await parent();
	if (user?.role !== 'admin') error(403, 'Admins only');
	const db = rawDb(platform?.env?.DB);
	if (!db) error(500, 'Database unavailable');
	const r = url.searchParams.get('range') ?? '';
	const range = r in RANGES ? r : '24h';
	const since = Date.now() - RANGES[/** @type {keyof typeof RANGES} */ (range)];

	try {
		const settings = await readSettings(db);
		const rows = /** @type {any[]} */ ((await db.prepare(
			`SELECT id, started_at, total_ms, method, path, route, status, user_email, query_count, query_ms, db_ms, rows_read, queries
			 FROM perf_request WHERE started_at >= ? ORDER BY started_at DESC LIMIT 2000`
		).bind(since).all()).results ?? []);
		const requests = rows.map((x) => ({ ...x, queries: (() => { try { return JSON.parse(x.queries || '[]'); } catch { return []; } })() }));

		// Per page/API route.
		const byRoute = new Map();
		for (const q of requests) {
			const key = `${q.method} ${q.route ?? q.path.split('?')[0]}`;
			const g = byRoute.get(key) ?? { key, n: 0, total: 0, max: 0, queries: 0, wait: 0, db: 0, times: [] };
			g.n++; g.total += q.total_ms; g.max = Math.max(g.max, q.total_ms); g.queries += q.query_count;
			g.db += q.db_ms ?? 0; g.wait += Math.max(0, (q.query_ms ?? 0) - (q.db_ms ?? 0)); g.times.push(q.total_ms);
			byRoute.set(key, g);
		}
		const routes = [...byRoute.values()].map((g) => {
			const t = g.times.sort((a, b) => a - b);
			return { key: g.key, n: g.n, avg: Math.round(g.total / g.n), median: t[Math.floor(t.length / 2)], max: g.max,
				avgQueries: Math.round(g.queries / g.n), avgDb: Math.round(g.db / g.n), avgWait: Math.round(g.wait / g.n), totalMs: g.total };
		}).sort((a, b) => b.totalMs - a.totalMs);

		// Per query (across the logged requests' slowest-query lists).
		const byQuery = new Map();
		for (const q of requests) for (const s of q.queries) {
			const key = `${s.db}|${normSql(s.sql)}`;
			const g = byQuery.get(key) ?? { db: s.db, sql: s.sql, runs: 0, ms: 0, dbMs: 0, rows: 0, maxMs: 0, routes: new Set() };
			g.runs += s.n ?? 1; g.ms += s.ms; g.dbMs += s.dbMs ?? 0; g.rows += s.rows ?? 0; g.maxMs = Math.max(g.maxMs, s.maxMs ?? s.ms);
			g.routes.add(q.route ?? q.path.split('?')[0]);
			byQuery.set(key, g);
		}
		const queries = [...byQuery.values()].map((g) => ({
			db: g.db, sql: g.sql, runs: g.runs, totalMs: g.ms, avgMs: Math.round(g.ms / g.runs), avgDbMs: Math.round(g.dbMs / g.runs),
			avgRows: Math.round(g.rows / g.runs), maxMs: g.maxMs, routes: [...g.routes].slice(0, 4),
		})).sort((a, b) => b.totalMs - a.totalMs).slice(0, 100);

		return { user, ready: true, range, settings, now: Date.now(), requests: requests.slice(0, 500), routes, queries, count: requests.length };
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		return { user, ready: false, noTable: /no such table/i.test(message), message, range, settings: { until: 0, threshold: DEFAULT_THRESHOLD_MS }, now: Date.now(), requests: [], routes: [], queries: [], count: 0 };
	}
}
