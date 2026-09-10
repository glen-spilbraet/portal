import { error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getAllowedUser, getUserPermissions } from '$lib/db.js';

/** Gate a Price Sync API route by the `price_sync` permission. */
export async function requirePriceSync(cookies, platform) {
	const email = await verifySession(cookies.get('session') ?? '', platform?.env?.APP_SECRET ?? 'dev-secret');
	if (!email) error(401, 'Unauthorised');
	const db = platform?.env?.DB;
	const user = db ? await getAllowedUser(db, email) : null;
	if (!user) error(403, 'Forbidden');
	const perms = await getUserPermissions(db, user);
	if (!perms.price_sync) error(403, 'No access to Price Sync');
	return { db, user, email };
}
