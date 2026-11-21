/**
 * The Portal's one access gate (called from hooks.server.js for EVERY request).
 *
 * Before this existed, only page views were protected (by the root layout);
 * form actions, `__data.json` requests and most API endpoints had to remember
 * their own check — and many did not. Now:
 *
 *   1. A route is public only if it is listed in PUBLIC below.
 *   2. Everything else needs a valid session AND a row in allowed_users
 *      (so a removed user loses access at once, not when the cookie expires).
 *   3. Page data requests, form actions and API calls must also pass the
 *      section rule for their path (pageRule / apiRule).
 *
 * Endpoints keep their own finer checks (ownership, division access, …); this
 * gate is the floor, not the ceiling. The signed-in user is left on
 * `event.locals.auth` so the layout and endpoints need not look it up again.
 */

import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/**
 * Everything here is decided from the MATCHED ROUTE (`event.route.id`, e.g.
 * `/api/catalogues/[id]/items`) and `event.params` — never from the raw URL.
 * SvelteKit matches routes on the decoded path but leaves `url.pathname` as it
 * was sent, so `/api/%6dail/…` reaches the mail endpoint while a check on the
 * raw string would not recognise it.
 */

/**
 * Routes reachable without a Portal session. Each has its own protection
 * (share token, bearer key, OAuth) or is part of signing in. An entry ending
 * in "/" covers everything below it; any other entry is that exact route.
 */
const PUBLIC = [
	'/login', '/logout', '/auth/',
	'/share/', '/planograms/share/', '/events/share/', '/events/guru/',
	'/tombola/', '/reports/share/', '/media/',
	'/oauth/', '/[x+2e]well-known/', '/mcp',
	'/api/shop/', '/api/warehouse/warm',
	'/api/share/', '/api/planograms/share/', '/api/events/share/', '/api/events/guru/',
	'/api/tombola/', '/api/errors', '/api/admin/simulate/end',
	'/api/img/',
];

/** @param {string | null | undefined} routeId */
export const isPublicRoute = (routeId) => !!routeId && PUBLIC.some((p) => (p.endsWith('/') ? routeId.startsWith(p) : routeId === p));

// Which routes are plain endpoints (+server.js with no page)? Their GETs are
// not "page views": the root layout never runs for them, so the gate must
// apply the section rule itself. (Keys only — nothing is imported.)
const routeIdOf = (/** @type {string} */ file) => file.replace(/^\/src\/routes/, '').replace(/\/\+[^/]+$/, '') || '/';
const PAGES = new Set(Object.keys(import.meta.glob('/src/routes/**/+page.svelte')).map(routeIdOf));
const ENDPOINT_ONLY = new Set(Object.keys(import.meta.glob('/src/routes/**/+server.js')).map(routeIdOf).filter((id) => !PAGES.has(id)));

/**
 * The session secret. Falls back to a fixed value ONLY under `vite dev`; a
 * deployed site without APP_SECRET must refuse to work rather than accept
 * forgeable sessions.
 * @param {App.Platform | undefined} platform
 * @returns {string | null}
 */
export function sessionSecret(platform) {
	return platform?.env?.APP_SECRET ?? (dev ? 'dev-secret' : null);
}

/**
 * A post-login destination is only followed when it is a path on this site.
 * @param {string | null | undefined} next
 */
export function safeNext(next) {
	const n = String(next ?? '');
	// Browsers drop tabs/newlines and treat "\" as "/" when parsing a URL, so
	// "/\t/evil.com" would become "//evil.com".
	if (!n.startsWith('/') || /[\x00-\x1f\x7f\\]/.test(n)) return '/';
	try {
		const base = 'http://portal.invalid';
		const u = new URL(n, base);
		return u.origin === base ? u.pathname + u.search + u.hash : '/';
	} catch { return '/'; }
}

/** Map a route id (or path) to the section permission it requires (null = no section rule). @param {string} pathname */
export function sectionForPath(pathname) {
	if (pathname === '/')                                    return 'stats';
	if (pathname.startsWith('/sheets') || pathname.startsWith('/sheet/')) return 'sheets';
	if (pathname.startsWith('/catalogues'))                  return 'catalogues';
	if (pathname.startsWith('/planograms'))                  return 'planograms';
	if (pathname.startsWith('/data'))                        return 'data';
	if (pathname.startsWith('/mail'))                        return 'mail';
	if (pathname.startsWith('/price-lists'))                 return 'price_lists';
	if (pathname.startsWith('/orders/rest-check'))           return 'rest_check';
	if (pathname.startsWith('/orders/price-sync'))           return 'price_sync';
	if (pathname.startsWith('/orders/order-confirmations'))  return 'order_conf';
	if (pathname.startsWith('/orders/q4-orders'))            return 'q4_orders';
	if (pathname.startsWith('/orders'))                      return 'orders';
	if (pathname.startsWith('/product'))                     return 'product';
	if (pathname.startsWith('/forecast'))                    return 'forecast';
	if (pathname.startsWith('/reports'))                     return 'reports';
	if (pathname.startsWith('/warehouse'))                   return 'warehouse';
	if (pathname.startsWith('/credit-notes'))                return 'credit_notes';
	if (pathname.startsWith('/knowledge'))                   return 'knowledge';
	if (pathname.startsWith('/awards'))                      return 'awards';
	if (pathname.startsWith('/initiatives'))                 return 'initiatives';
	if (pathname.startsWith('/events'))                      return 'events';
	return null;
}

/** The sheet editor and "new sheet" need edit access, not just view. @param {string} pathname route id */
export const isSheetEditPath = (pathname) => pathname === '/sheet/new' || pathname === '/sheet/[id]';

/**
 * What a request needs beyond "signed-in allowed user".
 * @param {string} pathname @param {string} method
 * @returns {{ admin?: boolean, perm?: string, anyPerm?: string[] } | null}
 */
export function ruleFor(pathname, method) {
	const read = method === 'GET' || method === 'HEAD';
	if (pathname.startsWith('/api/')) {
		if (pathname.startsWith('/api/admin/'))         return { admin: true };
		if (pathname.startsWith('/api/cta-versions'))   return { admin: true };
		if (pathname.startsWith('/api/sheets') || pathname.startsWith('/api/images')) return { perm: read ? 'sheets' : 'sheetsEdit' };
		if (pathname.startsWith('/api/catalogues'))     return { perm: 'catalogues' };
		if (pathname.startsWith('/api/planograms'))     return { perm: 'planograms' };
		if (pathname.startsWith('/api/data-products'))  return { perm: 'data' };
		if (pathname.startsWith('/api/mail'))           return { perm: 'mail' };
		// The item library is maintained by admins; the planogram editor reads from it.
		if (pathname.startsWith('/api/item-library'))   return read ? { anyPerm: ['planograms'] } : { admin: true };
		return null; // signed-in allowed user; the endpoint's own check decides the rest
	}
	if (pathname.startsWith('/admin') || pathname.startsWith('/translations')) return { admin: true };
	if (isSheetEditPath(pathname)) return { perm: 'sheetsEdit' };
	const section = sectionForPath(pathname);
	return section ? { perm: section } : null;
}

/** Owned things: catalogues and planograms belong to their creator and the people they are shared with. */
const OWNED = /** @type {Record<string, { table: string, shares: string, fk: string, folders: string, items: string }>} */ ({
	catalogues: { table: 'catalogues', shares: 'catalogue_shares', fk: 'catalogue_id', folders: 'catalogue_folders', items: 'catalogue_items' },
	planograms: { table: 'planogram_projects', shares: 'planogram_shares', fk: 'project_id', folders: 'planogram_folders', items: 'planogram_library_items' },
});

/**
 * May this (non-admin) user touch the catalogue / planogram / folder this
 * route names? Owner or shared-with: yes. Items without an owner (older data)
 * stay open to everyone with the section. An id that does not exist is left to
 * the endpoint (404).
 * @param {any} db @param {string} routeId @param {Record<string, string>} params @param {string} email
 */
async function ownsTarget(db, routeId, params, email) {
	const m = routeId.match(/^\/(?:api\/)?(catalogues|planograms)\/(folders\/)?\[id\](?:\/|$)/);
	if (!m || !params.id) return true;
	const o = OWNED[m[1]];
	if (m[2]) {
		const f = await db.prepare(`SELECT created_by FROM ${o.folders} WHERE id = ?`).bind(params.id).first();
		return !f || !f.created_by || f.created_by === email;
	}
	// An item addressed through this catalogue / planogram must belong to it —
	// otherwise one's own id in the URL would unlock anybody's item.
	if (params.itemId && routeId.includes('/[id]/items/[itemId]')) {
		const item = await db.prepare(`SELECT ${o.fk} AS parent FROM ${o.items} WHERE id = ?`).bind(params.itemId).first();
		if (item && String(item.parent) !== String(params.id)) return false;
	}
	const row = await db.prepare(`SELECT created_by FROM ${o.table} WHERE id = ?`).bind(params.id).first();
	if (!row || !row.created_by || row.created_by === email) return true;
	return !!(await db.prepare(`SELECT 1 FROM ${o.shares} WHERE ${o.fk} = ? AND shared_with_email = ?`).bind(params.id, email).first());
}

/** @param {number} status @param {string} message */
const deny = (status, message) => new Response(JSON.stringify({ message }), {
	status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/**
 * Check a request. Returns a Response to send instead of the endpoint, or null
 * to let it through (with `event.locals.auth` set for signed-in requests).
 * For pages it throws SvelteKit's own redirect()/error(), which SvelteKit turns
 * into the right thing for a page view, a data request or a form action.
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<Response | null>}
 */
export async function gate(event) {
	const routeId = event.route?.id ?? null;
	if (!routeId) return null;              // no such route → SvelteKit answers 404; nothing to protect
	if (isPublicRoute(routeId)) return null;

	const method = event.request.method;
	const read = method === 'GET' || method === 'HEAD';
	const isApi = routeId.startsWith('/api/');
	// A plain page view: the root layout applies the section rule (it also
	// knows about "simulate user") and renders the proper error page.
	const isPageView = read && !event.isDataRequest && !ENDPOINT_ONLY.has(routeId);
	/** @param {number} status @param {string} message @returns {Response} */
	const stop = (status, message) => { if (isApi) return deny(status, message); error(status, message); };
	/** @param {string} to @param {number} status @param {string} message @returns {Response} */
	const signIn = (to, status, message) => { if (isApi) return deny(status, message); redirect(303, to); };

	const secret = sessionSecret(event.platform);
	if (!secret) return stop(500, 'Server is missing its session secret.');

	const email = await verifySession(event.cookies.get('session') ?? '', secret);
	if (!email) return signIn(`/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`, 401, 'Please sign in again.');

	// Identity is proven by the signed token; a DB problem from here on is an
	// infrastructure failure ("try again"), never a logout.
	const db = event.platform?.env?.DB;
	if (!db) return stop(503, 'Service temporarily unavailable. Please try again.');

	const rule = routeId === '/' ? null : ruleFor(routeId, method); // "/" → the layout picks the user's landing page
	let user, permissions;
	try {
		user = await getAllowedUser(db, email);
		// Permissions cost a second query: only fetch them when something will use them.
		if (user && user.role !== 'admin' && (rule || !isApi)) permissions = await getUserPermissions(db, user);
	} catch {
		return stop(503, 'Service temporarily unavailable. Please try again.');
	}
	if (!user) return signIn('/login?error=not_allowed', 403, 'Your access to the Portal has been removed.');

	/** @type {any} */ (event.locals).auth = { email, user, permissions };
	if (user.role === 'admin') return null;

	// Someone else's catalogue / planogram (not shared with this user).
	let owns = true;
	try { owns = await ownsTarget(db, routeId, event.params, email); }
	catch { return stop(503, 'Service temporarily unavailable. Please try again.'); }
	if (!owns) {
		if (isPageView) redirect(303, `/${routeId.split('/')[1]}`);
		return stop(403, 'This belongs to someone else and is not shared with you.');
	}

	if (isPageView || !rule) return null;
	if (rule.admin) return stop(403, 'Admins only.');
	if (rule.perm && !permissions?.[rule.perm]) return stop(403, "You don't have access to this.");
	if (rule.anyPerm && !rule.anyPerm.some((p) => permissions?.[p])) return stop(403, "You don't have access to this.");
	return null;
}
