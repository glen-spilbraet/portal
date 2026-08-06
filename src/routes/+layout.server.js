import { redirect, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/** Map a pathname to the section key it requires. Returns null for unguarded paths. */
function sectionForPath(pathname) {
	if (pathname === '/')                                    return 'stats';
	if (pathname.startsWith('/sheets') || pathname.startsWith('/sheet/')) return 'sheets';
	if (pathname.startsWith('/catalogues'))                  return 'catalogues';
	if (pathname.startsWith('/planograms'))                  return 'planograms';
	if (pathname.startsWith('/data'))                        return 'data';
	if (pathname.startsWith('/mail'))                        return 'mail';
	if (pathname.startsWith('/price-lists'))                 return 'price_lists';
	if (pathname.startsWith('/orders'))                      return 'orders';
	if (pathname.startsWith('/product'))                     return 'product';
	return null;
}

export async function load({ cookies, url, platform }) {
	const isDev = platform?.env?.ENVIRONMENT === 'dev';

	// Public / auth routes — skip all checks
	if (url.pathname === '/login') return { isDev };
	if (url.pathname.startsWith('/share/')) return { isDev };
	if (url.pathname.startsWith('/planograms/share/')) return { isDev };
	if (url.pathname.startsWith('/auth/')) return { isDev };

	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';

	const email = await verifySession(token ?? '', secret);
	if (!email) redirect(303, `/login?next=${encodeURIComponent(url.pathname)}`);

	const db   = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) redirect(303, '/login?error=not_allowed');

	const realPermissions = db
		? await getUserPermissions(db, user)
		: { sheets: true, catalogues: true, planograms: true, data: true, price_lists: true, stats: true };

	// ── Simulation (admins only) ─────────────────────────────────────────────
	let simulatedAs = null;
	let effectivePermissions = realPermissions;
	let effectiveRole = user.role;
	let effectiveFirstName = user.first_name ?? null;

	if (user.role === 'admin' && db) {
		const simEmail = cookies.get('simulate_as');
		if (simEmail && simEmail !== email) {
			const simUser = await getAllowedUser(db, simEmail);
			if (simUser) {
				const simPerms = await getUserPermissions(db, simUser);
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
