/**
 * Performance log (Admin → Performance). Off by default. When switched on (for
 * a set number of hours, then it turns itself off), every request's database
 * queries are timed in the D1 wrapper (d1Retry.js) and requests slower than the
 * threshold get ONE row in perf_request: total time, query count, time spent in
 * the database vs. waiting, and the slowest queries. Written after the response
 * (waitUntil), on the raw binding, so logging never slows a page or logs itself.
 *
 * The on/off state is read at most every 30 s per worker isolate, so a request
 * normally costs no extra database read.
 */

/** @typedef {import('@cloudflare/workers-types').D1Database} D1 */

const CHECK_EVERY_MS = 30_000;
export const DEFAULT_THRESHOLD_MS = 500;
const KEEP_DAYS = 14;
const MAX_QUERIES = 15;

/** @type {{ at: number, until: number, threshold: number }} */
let state = { at: 0, until: 0, threshold: DEFAULT_THRESHOLD_MS };

/** Read the settings (no cache). @param {D1} db */
export async function readSettings(db) {
	const rows = (await db.prepare('SELECT key, value FROM perf_setting').all()).results ?? [];
	const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
	const t = Number(m.threshold_ms);
	return { until: Number(m.until) || 0, threshold: Number.isFinite(t) && t >= 0 ? t : DEFAULT_THRESHOLD_MS };
}

/**
 * Is logging on right now? Cached per isolate. A missing table (migration not
 * applied) simply means "off".
 * @param {D1} db raw (unwrapped) app DB
 * @returns {Promise<{ threshold: number } | null>}
 */
export async function perfActive(db) {
	const now = Date.now();
	if (now - state.at > CHECK_EVERY_MS) {
		state.at = now; // set first: concurrent requests don't all re-read
		try { const s = await readSettings(db); state = { at: now, ...s }; }
		catch { state = { at: now, until: 0, threshold: DEFAULT_THRESHOLD_MS }; }
	}
	return now < state.until ? { threshold: state.threshold } : null;
}

/** Turn on for `hours` with a threshold, or off (hours = 0). Resets the isolate cache. @param {D1} db */
export async function setPerf(db, hours, threshold) {
	const until = hours > 0 ? Date.now() + hours * 3600_000 : 0;
	await db.batch([
		db.prepare(`INSERT INTO perf_setting (key, value) VALUES ('until', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(String(until)),
		db.prepare(`INSERT INTO perf_setting (key, value) VALUES ('threshold_ms', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(String(threshold)),
	]);
	state = { at: Date.now(), until, threshold };
	return { until, threshold };
}

/** Collapse whitespace and long placeholder lists so the same query groups together. */
export const normSql = (sql) => String(sql ?? '').replace(/\s+/g, ' ').replace(/\?(\s*,\s*\?)+/g, '?…').trim();

/**
 * One row for a finished request (call via waitUntil).
 * @param {D1} db raw app DB
 * @param {{ startedAt: number, totalMs: number, method: string, path: string, route: string | null, status: number, user: string | null, queries: any[] }} r
 */
export async function recordRequest(db, r) {
	const qs = r.queries;
	// Same statement run several times in one request → one entry with a count.
	const grouped = new Map();
	for (const q of qs) {
		const key = `${q.db}|${normSql(q.sql)}`;
		const g = grouped.get(key) ?? { db: q.db, sql: normSql(q.sql).slice(0, 600), ms: 0, dbMs: 0, rows: 0, n: 0, maxMs: 0 };
		g.ms += q.ms; g.dbMs += q.dbMs ?? 0; g.rows += q.rows ?? 0; g.n += 1; g.maxMs = Math.max(g.maxMs, q.ms);
		grouped.set(key, g);
	}
	const top = [...grouped.values()].sort((a, b) => b.ms - a.ms).slice(0, MAX_QUERIES)
		.map((g) => ({ ...g, dbMs: Math.round(g.dbMs * 10) / 10 }));
	await db.prepare(
		`INSERT INTO perf_request (started_at, total_ms, method, path, route, status, user_email, query_count, query_ms, db_ms, rows_read, queries)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).bind(
		r.startedAt, r.totalMs, r.method, r.path.slice(0, 300), r.route, r.status, r.user,
		qs.length, qs.reduce((n, q) => n + q.ms, 0), Math.round(qs.reduce((n, q) => n + (q.dbMs ?? 0), 0) * 10) / 10,
		qs.reduce((n, q) => n + (q.rows ?? 0), 0), JSON.stringify(top),
	).run();
	// Light housekeeping (~1 in 50 writes).
	if (Math.random() < 0.02) await db.prepare('DELETE FROM perf_request WHERE started_at < ?').bind(Date.now() - KEEP_DAYS * 86400_000).run();
}
