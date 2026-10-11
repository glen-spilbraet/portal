import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/** Guard for the Knowledge API/pages: session + `knowledge` permission. Returns
 * { db, user } where user includes role/email/department (for visibility). */
export async function requireKnowledge({ cookies, platform }) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	if (!db) error(500, 'Database unavailable');
	const user = await getAllowedUser(db, email);
	if (!user) error(403, 'Access denied');
	const perms = await getUserPermissions(db, user);
	if (!perms.knowledge) error(403, 'No access to knowledge');
	return { db, user };
}
