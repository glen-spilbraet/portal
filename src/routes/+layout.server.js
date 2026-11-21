import { redirect, error } from '@sveltejs/kit';
import { verifySession, createSession, sessionAgeMs } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';
import { sectionForPath, isSheetEditPath, isPublicRoute, sessionSecret } from '$lib/server/access.js';

const SESSION_TTL_S = 7 * 24 * 60 * 60;
// Re-issue the session cookie once it's older than this, so active users never
// hit the 7-day wall mid-work (sliding expiry).
const SESSION_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Run an idempotent DB read with a couple of quick retries. portal-db is large
 * and occasionally throws transient errors ("Network connection lost"); a single
 * blip must NOT look like a failed query to the caller. Throws only if every
 * attempt fails.
 */
async function dbRead(fn, tries = 3) {
	let lastErr;
	for (let i = 0; i < tries; i++) {
		try {
			return await fn();
		} catch (e) {
			lastErr = e;
			if (i < tries - 1) await new Promise((r) => setTimeout(r, 60 * (i + 1)));
		}
	}
	throw lastErr;
}

export async function load({ cookies, url, route, platform, locals }) {
	const isDev = platform?.env?.ENVIRONMENT === 'dev';

	// Public / auth routes (share links, sign-in, …) — see PUBLIC in access.js
	// Rules are keyed on the matched route, never the raw URL (see access.js).
	const routeId = route.id ?? '';
	if (isPublicRoute(routeId)) return { isDev };

	const token  = cookies.get('session');
	const secret = sessionSecret(platform);
	if (!secret) error(500, 'Server is missing its session secret.');

	const email = await verifySession(token ?? '', secret);
	if (!email) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);

	// Identity is already proven by the signed token. From here, a DB problem is
	// an infrastructure failure — surface it as "try again" (503), NEVER as a
	// logout. Only a successful lookup that finds no row is a real auth failure.
	const db = platform?.env?.DB;
	if (!db) error(503, 'Service temporarily unavailable. Please try again.');

	// hooks.server.js (access gate) has normally looked the user up already.
	const known = /** @type {any} */ (locals).auth?.email === email ? /** @type {any} */ (locals).auth : null;
	let user;
	try {
		user = known?.user ?? await dbRead(() => getAllowedUser(db, email));
	} catch {
		error(503, 'Service temporarily unavailable. Please try again.');
	}
	if (!user) redirect(303, '/login?error=not_allowed');

	// Sliding session: refresh the cookie for active users well before it expires.
	const age = sessionAgeMs(token ?? '');
	if (age != null && age > SESSION_REFRESH_AFTER_MS) {
		cookies.set('session', await createSession(email, secret), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: SESSION_TTL_S,
			secure: url.protocol === 'https:',
		});
	}

	let realPermissions;
	try {
		realPermissions = known?.permissions ?? await dbRead(() => getUserPermissions(db, user));
	} catch {
		error(503, 'Service temporarily unavailable. Please try again.');
	}

	// ── Simulation (admins only) ─────────────────────────────────────────────
	let simulatedAs = null;
	let effectivePermissions = realPermissions;
	let effectiveRole = user.role;
	let effectiveFirstName = user.first_name ?? null;

	if (user.role === 'admin' && db) {
		const simEmail = cookies.get('simulate_as');
		if (simEmail && simEmail !== email) {
			const simUser = await dbRead(() => getAllowedUser(db, simEmail));
			if (simUser) {
				const simPerms = await dbRead(() => getUserPermissions(db, simUser));
				simulatedAs = {
					email:      simUser.email,
					first_name: simUser.first_name ?? null,
				};
				effectivePermissions = simPerms;
				effectiveRole        = simUser.role;
				effectiveFirstName   = simUser.first_name ?? null;
			}
		}
	}

	// The dashboard (Stats) is the homepage, but a user may not have it. In that
	// case land them on the leftmost nav section they can reach — mirroring the
	// nav order: Stats, Sales (sheets → price list), Orders, Data, Mail. Every
	// section must be listed, or a user who only has that one gets a 403 at login.
	if (url.pathname === '/' && !effectivePermissions.stats) {
		const fallback = [
			['product', '/product'],
			['forecast', '/forecast'],
			['awards', '/awards'],
			['initiatives', '/initiatives'],
			['events', '/events'],
			['sheets', '/sheets'],
			['catalogues', '/catalogues'],
			['planograms', '/planograms'],
			['price_lists', '/price-lists'],
			['warehouse', '/warehouse'],
			['orders', '/orders'],
			['q4_orders', '/orders/q4-orders'],
			['rest_check', '/orders/rest-check'],
			['price_sync', '/orders/price-sync'],
			['order_conf', '/orders/order-confirmations'],
			['reports', '/reports'],
			['credit_notes', '/credit-notes'],
			['knowledge', '/knowledge'],
			['data', '/data'],
			['mail', '/mail/accounts'],
		].find(([perm]) => effectivePermissions[perm]);
		if (fallback) redirect(303, fallback[1]);
	}

	// Block routes based on effective (possibly simulated) permissions
	const section = sectionForPath(routeId);
	if (section && !effectivePermissions[section]) {
		error(403, "You don't have access to this section.");
	}

	// Sheets has two levels: view (overview, search, preview) and edit (the
	// editor). View-only users may browse but not open the editor / create.
	if (section === 'sheets' && !effectivePermissions.sheetsEdit && isSheetEditPath(routeId)) {
		error(403, "You don't have edit access to Sheets.");
	}

	return {
		isDev,
		user: {
			email:       user.email,
			role:        effectiveRole,
			name:        user.name,
			first_name:  effectiveFirstName,
			permissions: effectivePermissions,
		},
		simulatedAs,
	};
}
