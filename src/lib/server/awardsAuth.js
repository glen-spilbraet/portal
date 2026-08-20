import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/** Gate an Awards & Press API route by the `awards` permission. */
export async function requireAwards(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(db, user);
	if (!perms.awards) error(403, 'No access to Awards & Press');
	return { db, user, email };
}
