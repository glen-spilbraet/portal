import { notifyShops } from '$lib/server/shopNotify.js';
import { bumpDataVersion } from '$lib/server/reportCache.js';
import { d1WithRetry } from '$lib/server/d1Retry.js';
import { logError, describe, newRef } from '$lib/server/errorLog.js';
import { verifySession } from '$lib/auth.js';

/** Signed-in user's email for the error log (null if anonymous). @param {import('@sveltejs/kit').RequestEvent} event */
async function userOf(event) {
	try { return await verifySession(event.cookies.get('session') ?? '', event.platform?.env?.APP_SECRET ?? 'dev-secret'); }
	catch { return null; }
}

/** Common request fields for an error_log row. @param {import('@sveltejs/kit').RequestEvent} event */
const reqInfo = (event) => ({
	method: event.request.method,
	path: event.url.pathname + event.url.search,
	route: event.route?.id ?? null,
	ua: event.request.headers.get('user-agent'),
});

/**
 * Keep the B2B shops in step with the Portal: after any successful save that
 * changes what the shop shows, tell both shops at once.
 *   a sheet changed        → { type: 'products', skus }  (shop refreshes those)
 *   awards / categories /
 *   publishers / series    → { type: 'full' }            (touch many products)
 * Webshop publishing has its own, more precise notice (see shopNotify.js).
 * Read-only requests pass straight through.
 */

const FULL = [
	/^\/api\/awards(\/|$)/, /^\/awards(\/|$)/, /^\/sheets\/awards(\/|$)/, /^\/sheet\/[^/]+\/award(\/|$)/,
	/^\/admin\/categories(\/|$)/, /^\/admin\/publishers(\/|$)/, /^\/api\/admin\/publishers(\/(?!markets)|$)/, /^\/api\/admin\/series(\/|$)/,
	/^\/sheet\/new(\/|$)/, /^\/api\/sheets\/?$/, /^\/admin\/sheet-data(\/|$)/
];

/** @param {any} db @param {string} id */
const skuOfSheet = async (db, id) => /** @type {any} */ (await db.prepare('SELECT sku FROM sales_sheets WHERE id = ?').bind(id).first())?.sku ?? null;
/** @param {any} db @param {string} imageId */
const sheetOfImage = async (db, imageId) => /** @type {any} */ (await db.prepare('SELECT sheet_id FROM sheet_images WHERE id = ?').bind(imageId).first())?.sheet_id ?? null;

/**
 * Which sheet a save is about, looked up BEFORE the save runs (a delete
 * removes the row). Returns sheet ids, 'full', or null (not shop-related).
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<string[] | 'full' | null>}
 */
async function shopTarget(event) {
	const path = event.url.pathname;
	const db = event.platform?.env?.DB;
	if (!db) return null;
	if (FULL.some((re) => re.test(path))) return 'full';

	let m = path.match(/^\/api\/sheets\/([^/]+)(?:\/([^/]+))?/);
	if (m) return m[2] === 'pdf' || m[2] === 'webshop' ? null : [m[1]];
	m = path.match(/^\/sheet\/([^/]+)\/?$/); // sheet page form actions
	if (m) return [m[1]];

	if (path === '/api/images') {
		const fd = await event.request.clone().formData().catch(() => null);
		// Multi-upload marks all but the last photo `quiet` → the shops get ONE notice.
		if (fd?.get('quiet') === '1') return null;
		const sheetId = fd?.get('sheetId')?.toString();
		return sheetId ? [sheetId] : null; // variant uploads carry no sheet and change nothing
	}
	if (path === '/api/images/swap') {
		const body = await event.request.clone().json().catch(() => ({}));
		const id = await sheetOfImage(db, String(body?.id1 ?? ''));
		return id ? [id] : null;
	}
	m = path.match(/^\/api\/images\/([^/]+)/);
	if (m) { const id = await sheetOfImage(db, m[1]); return id ? [id] : null; }
	return null;
}

// Edits under these paths change report Initiatives (see below).
const INITIATIVE_PATHS = /^\/(api\/)?(awards|events|admin\/publishers|admin\/series)(\/|$)/;

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Browsers ask for /favicon.ico (and an old link pointed at /favicon.png);
	// neither file exists, so each one rendered a 404 page — layout + DB lookups —
	// on every page view. Answer from the real icon, before touching the DB.
	if (event.url.pathname === '/favicon.ico' || event.url.pathname === '/favicon.png') {
		return new Response(null, { status: 301, headers: { Location: '/portal-fav.png', 'Cache-Control': 'public, max-age=86400' } });
	}
	// Every DB query in the app retries momentary D1 hiccups (see d1Retry.js).
	// Each request gets its own wrapped bindings, so retries are logged against
	// the page that hit them (Admin → Error Log, source "retry").
	const platform = event.platform;
	if (platform?.env) {
		try {
			const retries = /** @type {any[]} */ ([]);
			const onRetry = (/** @type {any} */ info) => retries.push(info);
			const env = { ...platform.env };
			if (env.DB) env.DB = d1WithRetry(env.DB, onRetry);
			if (env.SALES_DB) env.SALES_DB = d1WithRetry(env.SALES_DB, onRetry);
			/** @type {any} */ (platform).env = env; // plain per-request object at runtime
			/** @type {any} */ (event.locals).__retries = retries;
		} catch (e) { console.warn('D1 retry wrapper not applied', e); }
	}

	const response = await handleShop(event, resolve);

	// Edits that change report Initiatives → new data version, so cached
	// Initiatives are rebuilt on next view (reportCache.js dataVersion).
	if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) && response.status < 400
		&& INITIATIVE_PATHS.test(event.url.pathname) && platform?.env?.DB) {
		const work = bumpDataVersion(platform.env.DB, 'initiatives').catch((e) => console.warn('initiatives version bump failed', e));
		const ctx = /** @type {any} */ (platform).context;
		if (ctx?.waitUntil) ctx.waitUntil(work); else await work;
	}

	const locals = /** @type {any} */ (event.locals);
	// A 5xx that did not come from an unexpected exception (error(500) or an API
	// answering 500 itself) — still worth a row.
	if (response.status >= 500 && !locals.__errorLogged) {
		// error(5xx, '…') from an API: keep its message (e.g. the Rackbeat reason).
		let detail = '';
		try {
			const ct = response.headers.get('content-type') ?? '';
			if (ct.includes('json')) detail = String((await response.clone().json())?.message ?? '').slice(0, 300);
		} catch { /* body not readable — fine */ }
		logError(platform, { source: 'server', status: response.status, ...reqInfo(event), user: await userOf(event),
			message: detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status} response`, stack: '' });
	}
	// Retries: one row per request (only when something actually had to retry).
	const retries = locals.__retries ?? [];
	if (retries.length) {
		const failed = retries.filter((r) => !r.recovered);
		logError(platform, {
			source: 'retry', status: failed.length ? 500 : 200, ...reqInfo(event), user: await userOf(event),
			message: failed.length ? `D1 retry gave up (${failed.length} of ${retries.length})` : `D1 retry recovered (${retries.length})`,
			stack: retries.map((r) => `${r.recovered ? 'recovered' : 'FAILED'} after ${r.attempts} retr${r.attempts === 1 ? 'y' : 'ies'} — ${r.label}${r.message ? `\n    ${r.message}` : ''}`).join('\n'),
		});
	}
	return response;
}

/**
 * Shop notifications around saves (unchanged behaviour).
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {(event: import('@sveltejs/kit').RequestEvent) => Promise<Response> | Response} resolve
 */
async function handleShop(event, resolve) {
	const method = event.request.method;
	if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return resolve(event);

	/** @type {string[] | 'full' | null} */
	let target = null;
	/** @type {string[]} */
	let skusBefore = [];
	try {
		target = await shopTarget(event);
		const db = event.platform?.env?.DB;
		if (Array.isArray(target) && db) skusBefore = (await Promise.all(target.map((id) => skuOfSheet(db, id)))).filter(Boolean);
	} catch (e) { console.warn('shop target lookup failed', e); }

	const response = await resolve(event);

	// Form actions answer 200 even when they fail (the failure is in the body), so a
	// notice can be sent for nothing; the shop then just re-reads unchanged data.
	if (target && response.status < 400) {
		try {
			if (target === 'full') await notifyShops(event.platform, { type: 'full' });
			else {
				const db = event.platform?.env?.DB;
				const after = db ? (await Promise.all(target.map((id) => skuOfSheet(db, id)))).filter(Boolean) : [];
				const skus = [...new Set([...skusBefore, ...after].map((s) => String(s).trim()).filter(Boolean))];
				if (skus.length) await notifyShops(event.platform, { type: 'products', skus });
			}
		} catch (e) { console.warn('shop notify failed', e); }
	}
	return response;
}

/**
 * Log unexpected server errors with the path, so failures are traceable in the
 * Cloudflare logs instead of only showing "500 Internal Error".
 * @type {import('@sveltejs/kit').HandleServerError}
 */
export async function handleError({ error, event, status, message }) {
	// 404 (missing page) and 405 (bots POSTing to pages) aren't app errors.
	if (status === 404 || status === 405) return { message };
	console.error(`[${status}] ${event.request.method} ${event.url.pathname}:`, error);
	const ref = newRef();
	/** @type {any} */ (event.locals).__errorLogged = true;
	const { message: msg, stack } = describe(error);
	logError(event.platform, { source: 'server', status, ...reqInfo(event), user: await userOf(event), message: msg, stack, ref });
	return { message, ref };
}
