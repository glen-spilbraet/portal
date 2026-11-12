/**
 * D1 with automatic retry on transient failures.
 *
 * D1 occasionally rejects a query when the database is briefly busy ("overloaded
 * — too many resources consumed"), or drops the connection while the storage
 * object restarts. Those are momentary: the same query a moment later works.
 * Without a retry they surface as a bare "500 Internal Error" page.
 *
 * Reads (SELECT / WITH / PRAGMA) are retried on any transient error. Writes are
 * retried only on "overloaded", which D1 raises BEFORE running the statement —
 * an ambiguous error (connection lost mid-write) is never replayed.
 */

const TRANSIENT = /overloaded|too many resources|network connection lost|storage caused object to be reset|object to be reset|internal error|timed? ?out|try again/i;
const SAFE_FOR_WRITES = /overloaded|too many resources/i;
const DELAYS = [150, 450, 1000]; // ms before retry 1, 2, 3

const isRead = (sql) => /^\s*(--[^\n]*\n\s*)*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.3));

async function withRetry(fn, read, label, onRetry) {
	for (let attempt = 0; ; attempt++) {
		try {
			const out = await fn();
			if (attempt > 0) onRetry?.({ label, attempts: attempt, recovered: true });
			return out;
		} catch (e) {
			const msg = String(e?.message ?? e);
			const retryable = read ? TRANSIENT.test(msg) : SAFE_FOR_WRITES.test(msg);
			if (!retryable || attempt >= DELAYS.length) {
				if (attempt > 0) onRetry?.({ label, attempts: attempt, recovered: false, message: msg });
				throw e;
			}
			console.warn(`D1 transient error (${label}, attempt ${attempt + 1}) — retrying: ${msg}`);
			await sleep(DELAYS[attempt]);
		}
	}
}

/**
 * Optional per-query timing (Admin → Performance): wall time incl. retries and
 * waiting for the database, plus D1's own execution time / rows from `meta`
 * (not available for first()/raw(), which return rows only).
 * @param {((q: any) => void) | undefined} onQuery
 */
async function timed(onQuery, info, fn) {
	if (!onQuery) return fn();
	const t0 = Date.now();
	let out;
	try { out = await fn(); return out; }
	finally {
		const meta = out && !Array.isArray(out) && typeof out === 'object' ? out.meta : null;
		try { onQuery({ ...info, ms: Date.now() - t0, dbMs: meta?.duration ?? null, rows: meta?.rows_read ?? null }); } catch { /* never break a query */ }
	}
}

function wrapStatement(stmt, sql, onRetry, onQuery, dbName) {
	const read = isRead(sql);
	const tag = (l) => `${l}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
	const q = { db: dbName, sql };
	return {
		__raw: stmt,
		__sql: sql,
		bind: (...args) => wrapStatement(stmt.bind(...args), sql, onRetry, onQuery, dbName),
		first: (col) => timed(onQuery, q, () => withRetry(() => stmt.first(col), read, tag('first'), onRetry)),
		all: () => timed(onQuery, q, () => withRetry(() => stmt.all(), read, tag('all'), onRetry)),
		run: () => timed(onQuery, q, () => withRetry(() => stmt.run(), read, tag('run'), onRetry)),
		raw: (opts) => timed(onQuery, q, () => withRetry(() => stmt.raw(opts), read, tag('raw'), onRetry)),
	};
}

/**
 * Wrap a D1 binding. Wrapping an already-wrapped binding re-wraps its raw one,
 * so each request can carry its own `onRetry` / `onQuery` callbacks.
 * @param {any} db @param {(info: any) => void} [onRetry]
 * @param {(q: any) => void} [onQuery] per-query timing (performance log), when on
 * @param {string} [dbName] label for the timing ('DB' | 'SALES_DB')
 */
export function d1WithRetry(db, onRetry, onQuery, dbName) {
	if (!db) return db;
	db = db.__raw ?? db;
	return {
		__retrying: true,
		__raw: db,
		prepare: (sql) => wrapStatement(db.prepare(sql), sql, onRetry, onQuery, dbName),
		batch: async (stmts) => {
			// A batch is one transaction: retry only when overloaded (rejected before running).
			const raw = stmts.map((s) => s?.__raw ?? s);
			if (!onQuery) return withRetry(() => db.batch(raw), false, 'batch', onRetry);
			const t0 = Date.now();
			let out;
			try { out = await withRetry(() => db.batch(raw), false, 'batch', onRetry); return out; }
			finally {
				const res = Array.isArray(out) ? out : [];
				try {
					onQuery({
						db: dbName, sql: `[batch ×${stmts.length}] ${stmts[0]?.__sql ?? ''}`, ms: Date.now() - t0,
						dbMs: res.length ? res.reduce((n, r) => n + (r?.meta?.duration ?? 0), 0) : null,
						rows: res.length ? res.reduce((n, r) => n + (r?.meta?.rows_read ?? 0), 0) : null,
					});
				} catch { /* never break a query */ }
			}
		},
		exec: (sql) => withRetry(() => db.exec(sql), false, 'exec', onRetry),
		dump: () => db.dump(),
		withSession: (...a) => db.withSession(...a),
	};
}
