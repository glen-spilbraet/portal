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

function wrapStatement(stmt, sql, onRetry) {
	const read = isRead(sql);
	const tag = (l) => `${l}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`;
	return {
		__raw: stmt,
		bind: (...args) => wrapStatement(stmt.bind(...args), sql, onRetry),
		first: (col) => withRetry(() => stmt.first(col), read, tag('first'), onRetry),
		all: () => withRetry(() => stmt.all(), read, tag('all'), onRetry),
		run: () => withRetry(() => stmt.run(), read, tag('run'), onRetry),
		raw: (opts) => withRetry(() => stmt.raw(opts), read, tag('raw'), onRetry),
	};
}

/**
 * Wrap a D1 binding. Wrapping an already-wrapped binding re-wraps its raw one,
 * so each request can carry its own `onRetry` callback.
 * @param {any} db @param {(info: any) => void} [onRetry]
 */
export function d1WithRetry(db, onRetry) {
	if (!db) return db;
	db = db.__raw ?? db;
	return {
		__retrying: true,
		__raw: db,
		prepare: (sql) => wrapStatement(db.prepare(sql), sql, onRetry),
		batch: (stmts) => {
			// A batch is one transaction: retry only when overloaded (rejected before running).
			const raw = stmts.map((s) => s?.__raw ?? s);
			return withRetry(() => db.batch(raw), false, 'batch', onRetry);
		},
		exec: (sql) => withRetry(() => db.exec(sql), false, 'exec', onRetry),
		dump: () => db.dump(),
		withSession: (...a) => db.withSession(...a),
	};
}
