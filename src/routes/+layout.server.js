import { redirect, error } from '@sveltejs/kit';
import { verifySession, createSession, sessionAgeMs } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

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

/** Map a pathname to the section key it requires. Returns null for unguarded paths. */
function sectionForPath(pathname) {
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
	if (pathname.startsWith('/orders'))                      return 'orders';
	if (pathname.startsWith('/product'))                     return 'product';
	if (pathname.startsWith('/forecast'))                    return 'forecast';
	if (pathname.startsWith('/reports'))                     return 'reports';
	if (pathname.startsWith('/awards'))                      return 'awards';
	if (pathname.startsWith('/events'))                      return 'events';
	return null;
}

export async function load({ cookies, url, platform }) {
	const isDev = platform?.env?.ENVIRONMENT === 'dev';

	// Public / auth routes — skip all checks
	if (url.pathname === '/login') return { isDev };
	if (url.pathname.startsWith('/share/')) return { isDev };
	if (url.pathname.startsWith('/planograms/share/')) return { isDev };
	if (url.pathname.startsWith('/events/share/')) return { isDev }; // public venue event page (token-gated)
	if (url.pathname.startsWith('/events/guru/')) return { isDev };  // public guru proposal page (token-gated)
	if (url.pathname.startsWith('/reports/share/')) return { isDev }; // public shared report (token-gated)
	if (url.pathname.startsWith('/auth/')) return { isDev };

	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';

	const email = await verifySession(token ?? '', secret);
	if (!email) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);

	// Identity is already proven by the signed token. From here, a DB problem is
	// an infrastructure failure — surface it as "try again" (503), NEVER as a
	// logout. Only a successful lookup that finds no row is a real auth failure.
	const db = platform?.env?.DB;
	if (!db) error(503, 'Service temporarily unavailable. Please try again.');

	let user;
	try {
		user = await dbRead(() => getAllowedUser(db, email));
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
		realPermissions = await dbRead(() => getUserPermissions(db, user));
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
	// nav order: Stats, Sales (sheets → price list), Orders, Data, Mail.
	if (url.pathname === '/' && !effectivePermissions.stats) {
		const fallback = [
			['product', '/product'],
			['forecast', '/forecast'],
			['awards', '/awards'],
			['events', '/events'],
			['sheets', '/sheets'],
			['catalogues', '/catalogues'],
			['planograms', '/planograms'],
			['price_lists', '/price-lists'],
			['orders', '/orders'],
			['data', '/data'],
			['mail', '/mail/accounts'],
		].find(([perm]) => effectivePermissions[perm]);
		if (fallback) redirect(303, fallback[1]);
	}

	// Block routes based on effective (possibly simulated) permissions
	const section = sectionForPath(url.pathname);
	if (section && !effectivePermissions[section]) {
		error(403, "You don't have access to this section.");
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
