/**
 * The Portal's one access gate (called from hooks.server.js for EVERY request).
 *
 * Before this existed, only page views were protected (by the root layout);
 * form actions, `__data.json` requests and most API endpoints had to remember
 * their own check — and many did not. Now:
 *
 *   1. A path is public only if it is listed in PUBLIC below.
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
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/**
 * Paths reachable without a Portal session. Each has its own protection
 * (share token, bearer key, OAuth) or is part of signing in.
 */
const PUBLIC = [
	/^\/login\/?$/, /^\/logout\/?$/, /^\/auth\//,
	/^\/share\//, /^\/planograms\/share\//, /^\/events\/share\//, /^\/events\/guru\//,
	/^\/tombola\//, /^\/reports\/share\//, /^\/media\//,
	/^\/oauth\//, /^\/\.well-known\//, /^\/mcp\/?$/,
	/^\/api\/shop\//, /^\/api\/warehouse\/warm\/?$/,
	/^\/api\/share\//, /^\/api\/planograms\/share\//, /^\/api\/events\/share\//, /^\/api\/events\/guru\//,
	/^\/api\/tombola\//, /^\/api\/errors\/?$/, /^\/api\/admin\/simulate\/end\/?$/,
	/^\/api\/img\//,
];

/** @param {string} pathname */
export const isPublicPath = (pathname) => PUBLIC.some((re) => re.test(pathname));

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
 * (`//evil.com` and `/\\evil.com` start with "/" but leave the site.)
 * @param {string | null | undefined} next
 */
export function safeNext(next) {
	const n = String(next ?? '');
	return /^\/(?![/\\])/.test(n) && !/[\r\n]/.test(n) ? n : '/';
}

/** Map a page pathname to the section permission it requires (null = no section rule). @param {string} pathname */
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

/** The sheet editor and "new sheet" need edit access, not just view. @param {string} pathname */
export const isSheetEditPath = (pathname) => pathname === '/sheet/new' || /^\/sheet\/[^/]+\/?$/.test(pathname);

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
const OWNED = /** @type {Record<string, { table: string, shares: string, fk: string, folders: string }>} */ ({
	catalogues: { table: 'catalogues', shares: 'catalogue_shares', fk: 'catalogue_id', folders: 'catalogue_folders' },
	planograms: { table: 'planogram_projects', shares: 'planogram_shares', fk: 'project_id', folders: 'planogram_folders' },
});
const NOT_AN_ID = new Set(['new', 'share', 'folders', 'image-library', 'logo-library']);

/**
 * May this (non-admin) user touch the catalogue / planogram / folder a path
 * names? Owner or shared-with: yes. Items without an owner (older data) stay
 * open to everyone with the section. An id that does not exist is left to the
 * endpoint (404).
 * @param {any} db @param {string} pathname @param {string} email
 */
async function ownsTarget(db, pathname, email) {
	const m = pathname.match(/^\/(?:api\/)?(catalogues|planograms)\/([^/]+)(?:\/([^/]+))?/);
	if (!m) return true;
	const o = OWNED[m[1]];
	if (m[2] === 'folders') {
		if (!m[3]) return true; // list / create
		const f = await db.prepare(`SELECT created_by FROM ${o.folders} WHERE id = ?`).bind(m[3]).first();
		return !f || !f.created_by || f.created_by === email;
	}
	if (NOT_AN_ID.has(m[2])) return true;
	const row = await db.prepare(`SELECT created_by FROM ${o.table} WHERE id = ?`).bind(m[2]).first();
	if (!row || !row.created_by || row.created_by === email) return true;
	return !!(await db.prepare(`SELECT 1 FROM ${o.shares} WHERE ${o.fk} = ? AND shared_with_email = ?`).bind(m[2], email).first());
}

/** @param {number} status @param {string} message */
const deny = (status, message) => new Response(JSON.stringify({ message }), {
	status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/**
 * Check a request. Returns a Response to send instead of the page/endpoint, or
 * null to let it through (with `event.locals.auth` set for signed-in requests).
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<Response | null>}
 */
export async function gate(event) {
	const { pathname } = event.url;
	if (isPublicPath(pathname)) return null;

	const method = event.request.method;
	const isApi = pathname.startsWith('/api/');
	// A plain page view: the root layout renders the proper redirect / error page.
	const isPageView = !isApi && (method === 'GET' || method === 'HEAD') && !event.isDataRequest;
	/** @param {string} to */
	const sendTo = (to) => new Response(null, { status: 303, headers: { Location: to, 'Cache-Control': 'no-store' } });

	const secret = sessionSecret(event.platform);
	if (!secret) return deny(500, 'Server is missing its session secret.');

	const email = await verifySession(event.cookies.get('session') ?? '', secret);
	if (!email) return isPageView ? sendTo(`/login?next=${encodeURIComponent(pathname + event.url.search)}`) : deny(401, 'Please sign in again.');

	// Identity is proven by the signed token; a DB problem from here on is an
	// infrastructure failure ("try again"), never a logout.
	const db = event.platform?.env?.DB;
	if (!db) return deny(503, 'Service temporarily unavailable. Please try again.');
	let user, permissions;
	try {
		user = await getAllowedUser(db, email);
		if (user) permissions = await getUserPermissions(db, user);
	} catch {
		return deny(503, 'Service temporarily unavailable. Please try again.');
	}
	if (!user) return isPageView ? sendTo('/login?error=not_allowed') : deny(403, 'Your access to the Portal has been removed.');

	/** @type {any} */ (event.locals).auth = { email, user, permissions };

	if (user.role === 'admin') return null;

	// Someone else's catalogue / planogram (not shared with this user).
	try {
		if (!(await ownsTarget(db, pathname, email))) {
			return isPageView ? sendTo(`/${pathname.split('/')[1]}`) : deny(403, 'This belongs to someone else and is not shared with you.');
		}
	} catch {
		return deny(503, 'Service temporarily unavailable. Please try again.');
	}

	// Page views: the layout applies the section rule (it also knows about
	// "simulate user"), and each page's own load applies admin-only rules.
	if (isPageView) return null;

	const rule = ruleFor(pathname, method);
	if (!rule) return null;
	if (rule.admin) return deny(403, 'Admins only.');
	if (rule.perm && !permissions[rule.perm]) return deny(403, "You don't have access to this.");
	if (rule.anyPerm && !rule.anyPerm.some((p) => permissions[p])) return deny(403, "You don't have access to this.");
	return null;
}
