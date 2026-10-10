import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/**
 * Guard for the internal Reports API/pages. Verifies the portal session and the
 * `reports` permission. Returns { db, salesDb, user, email }. Throws otherwise.
 */
export async function requireReports({ cookies, platform }) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	const email = await verifySession(token ?? '', secret);
	if (!email) error(401, 'Unauthorised');

	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');

	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	const perms = await getUserPermissions(db, user);
	if (!perms.reports) error(403, 'No access to reports');

	return { db, salesDb: platform?.env?.SALES_DB, user, email };
}
