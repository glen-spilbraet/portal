import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser } from '$lib/db.js';

/**
 * Guard for the hidden Tasks tool. Admin-only for now: the route is deliberately
 * kept out of the nav (reachable only by people who know the URL), and this check
 * keeps non-admins out even if they find it. Returns the `DB` and `SALES_DB`
 * bindings (customer search reads SALES_DB).
 */
export async function requireTasks({ cookies, platform }) {
	const token  = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email  = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user || user.role !== 'admin') error(403, 'Access denied');

	return { db, salesDb: platform?.env?.SALES_DB, user, email };
}
