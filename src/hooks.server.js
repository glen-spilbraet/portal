import { notifyShops } from '$lib/server/shopNotify.js';
import { d1WithRetry } from '$lib/server/d1Retry.js';

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

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	// Every DB query in the app retries momentary D1 hiccups (see d1Retry.js).
	const env = event.platform?.env;
	if (env) {
		try {
			if (env.DB) env.DB = d1WithRetry(env.DB);
			if (env.SALES_DB) env.SALES_DB = d1WithRetry(env.SALES_DB);
		} catch (e) { console.warn('D1 retry wrapper not applied', e); }
	}

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
export function handleError({ error, event, status, message }) {
	if (status !== 404) console.error(`[${status}] ${event.request.method} ${event.url.pathname}:`, error);
	return { message };
}
