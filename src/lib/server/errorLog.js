/**
 * Persistent error log (table `error_log`, migration 0105, app DB per env).
 *
 * Cloudflare Pages keeps no searchable logs, so every server 5xx, client crash
 * and D1 retry is written here and shown in Admin → Error Log, grouped by a
 * fingerprint (source + route + message with ids/numbers stripped).
 *
 * Always best effort: written with the RAW D1 binding (never through the retry
 * wrapper), in the background (waitUntil), and a failure to log never affects
 * the request. Identical errors are throttled per isolate so a storm can't
 * flood the table (or add load to an already busy database).
 */

const MAX = { message: 2000, stack: 8000, path: 500, ua: 300 };
const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

/** Short reference shown to the user ("Reference: k3f9x2"). */
export const newRef = () => Math.random().toString(36).slice(2, 8);

/** Message with volatile parts removed, so the same failure groups together. */
function normalise(msg) {
	return String(msg ?? '')
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
		.replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
		.replace(/\d+/g, '#')
		.slice(0, 300);
}

async function hash(text) {
	const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
	return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const recent = new Map(); // fingerprint → last write (ms), per isolate
const THROTTLE_MS = 10_000;

/** The unwrapped D1 binding (see d1Retry.js), so logging never retries/loops. */
export const rawDb = (db) => db?.__raw ?? db;

/**
 * Record one error. Never throws.
 * @param {any} platform
 * @param {{ source: 'server'|'client'|'retry', status?: number, method?: string, path?: string,
 *   route?: string|null, message?: string, stack?: string, user?: string|null, ua?: string|null, ref?: string }} e
 */
export function logError(platform, e) {
	const db = rawDb(platform?.env?.DB);
	if (!db) return;
	const work = (async () => {
		const fingerprint = await hash(`${e.source}|${e.route ?? e.path ?? ''}|${normalise(e.message)}`);
		const now = Date.now();
		if (now - (recent.get(fingerprint) ?? 0) < THROTTLE_MS) return;
		recent.set(fingerprint, now);
		if (recent.size > 500) recent.clear();
		const stmt = () => db.prepare(
			`INSERT INTO error_log (ref, source, status, method, path, route, message, stack, user_email, user_agent, fingerprint)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).bind(
			e.ref ?? null, e.source, e.status ?? null, clip(e.method, 10), clip(e.path, MAX.path), clip(e.route, MAX.path),
			clip(e.message, MAX.message), clip(e.stack, MAX.stack), clip(e.user, 200), clip(e.ua, MAX.ua), fingerprint
		).run();
		try { await stmt(); }
		catch { await new Promise((r) => setTimeout(r, 1200)); await stmt().catch(() => {}); } // DB busy → one late retry
	})().catch(() => {});
	if (platform?.context?.waitUntil) platform.context.waitUntil(work);
}

/** Error → { message, stack } */
export function describe(err) {
	if (err instanceof Error) return { message: `${err.name !== 'Error' ? err.name + ': ' : ''}${err.message}`, stack: err.stack ?? '' };
	if (err && typeof err === 'object' && 'message' in err) return { message: String(err.message), stack: '' };
	return { message: String(err), stack: '' };
}
